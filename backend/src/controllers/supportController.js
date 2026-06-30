import pool from '../config/database.js';
import nodemailer from 'nodemailer';
import {
  isDatabaseConnectivityError,
  shouldUseDatabaseReadFallback,
  supabaseRestFetch,
  supabaseRestRequest,
} from '../services/supabaseRest.js';

// Create email transporter
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT || '587'),
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD
    }
  });
};

const cleanText = (value, maxLength = 1000) => String(value || '')
  .replace(/<[^>]*>/g, ' ')
  .replace(/[\u0000-\u001f\u007f]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, maxLength);

const escapeHtml = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const createTicketViaRest = async ({ userId, name, email, subject, message }) => {
  const rows = await supabaseRestRequest('support_tickets', {
    method: 'POST',
    prefer: 'return=representation',
    body: {
      user_id: userId,
      name,
      email,
      subject,
      message,
      status: 'open',
    },
  });

  return Array.isArray(rows) ? rows[0] : rows;
};

const sendTicketNotification = async (ticket, { name, email, subject, message }) => {
  try {
    const transporter = createTransporter();
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || '10th West Moto <noreply@10thwest.com>',
      to: process.env.SUPPORT_EMAIL || process.env.EMAIL_USER,
      subject: `New Support Ticket #${ticket.id}: ${subject}`,
      html: `
        <h2>New Support Ticket</h2>
        <p><strong>Ticket ID:</strong> ${ticket.id}</p>
        <p><strong>From:</strong> ${escapeHtml(name)} (${escapeHtml(email)})</p>
        <p><strong>Subject:</strong> ${escapeHtml(subject)}</p>
        <p><strong>Message:</strong></p>
        <p>${escapeHtml(message)}</p>
        <hr>
        <p><small>Submitted: ${new Date(ticket.created_at || Date.now()).toLocaleString()}</small></p>
      `,
    });
  } catch (emailError) {
    console.error('Failed to send ticket notification email:', emailError);
  }
};

// Create support ticket
export const createTicket = async (req, res) => {
  const name = cleanText(req.body?.name, 120);
  const email = cleanText(req.body?.email, 255).toLowerCase();
  const subject = cleanText(req.body?.subject, 160);
  const message = cleanText(req.body?.message, 5000);

  if (!name || !email || !subject || !message) {
    return res.status(400).json({ message: 'All fields are required' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: 'A valid email address is required' });
  }

  try {
    const userId = req.user?.id || null;
    let ticket = null;

    if (shouldUseDatabaseReadFallback()) {
      ticket = await createTicketViaRest({ userId, name, email, subject, message });
    } else {
      const result = await pool.query(
        `INSERT INTO support_tickets (user_id, name, email, subject, message, status)
         VALUES ($1, $2, $3, $4, $5, 'open')
         RETURNING *`,
        [userId, name, email, subject, message]
      );
      ticket = result.rows[0];
    }

    await sendTicketNotification(ticket, { name, email, subject, message });

    res.status(201).json({
      message: 'Support ticket created successfully',
      ticket
    });
  } catch (error) {
    console.error('Create ticket error:', error);
    if (isDatabaseConnectivityError(error)) {
      try {
        const userId = req.user?.id || null;
        const ticket = await createTicketViaRest({ userId, name, email, subject, message });
        await sendTicketNotification(ticket, { name, email, subject, message });
        return res.status(201).json({
          message: 'Support ticket created successfully',
          ticket,
          degraded: true,
        });
      } catch (fallbackError) {
        console.error('Create ticket Supabase REST fallback error:', fallbackError);
      }
    }
    res.status(500).json({ message: 'Failed to create support ticket' });
  }
};

// Get user's tickets
export const getUserTickets = async (req, res) => {
  try {
    if (shouldUseDatabaseReadFallback()) {
      const tickets = await supabaseRestFetch('support_tickets', {
        select: '*',
        user_id: `eq.${req.user.id}`,
        order: 'created_at.desc',
      });
      return res.json(Array.isArray(tickets) ? tickets : []);
    }

    const result = await pool.query(
      `SELECT * FROM support_tickets 
       WHERE user_id = $1 
       ORDER BY created_at DESC`,
      [req.user.id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get user tickets error:', error);
    if (isDatabaseConnectivityError(error)) {
      return res.json([]);
    }
    res.status(500).json({ message: 'Server error' });
  }
};

// Get all tickets (admin)
export const getAllTickets = async (req, res) => {
  try {
    const { status } = req.query;
    if (shouldUseDatabaseReadFallback()) {
      const params = {
        select: '*',
        order: 'created_at.desc',
      };
      if (status) params.status = `eq.${status}`;
      const tickets = await supabaseRestFetch('support_tickets', params);
      return res.json(Array.isArray(tickets) ? tickets : []);
    }

    let query = `
      SELECT st.*, u.name as user_name
      FROM support_tickets st
      LEFT JOIN users u ON st.user_id = u.id
    `;

    const params = [];

    if (status) {
      query += ' WHERE st.status = $1';
      params.push(status);
    }

    query += ' ORDER BY st.created_at DESC';

    const result = await pool.query(query, params);

    res.json(result.rows);
  } catch (error) {
    console.error('Get all tickets error:', error);
    if (isDatabaseConnectivityError(error)) {
      return res.json([]);
    }
    res.status(500).json({ message: 'Server error' });
  }
};

// Get single ticket
export const getTicketById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT st.*, u.name as user_name, u.email as user_email
       FROM support_tickets st
       LEFT JOIN users u ON st.user_id = u.id
       WHERE st.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    const ticket = result.rows[0];

    const isStaff = ['admin', 'super_admin', 'owner', 'store_staff'].includes(req.user?.role);

    // Check authorization
    if (!isStaff && ticket.user_id !== req.user?.id) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json(ticket);
  } catch (error) {
    console.error('Get ticket error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Update ticket status (admin)
export const updateTicketStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const validStatuses = ['open', 'in_progress', 'resolved', 'closed'];

  if (!status || !validStatuses.includes(status)) {
    return res.status(400).json({ message: 'Invalid status' });
  }

  try {
    const result = await pool.query(
      `UPDATE support_tickets 
       SET status = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2 
       RETURNING *`,
      [status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    res.json({
      message: 'Ticket status updated',
      ticket: result.rows[0]
    });
  } catch (error) {
    console.error('Update ticket status error:', error);
    res.status(500).json({ message: 'Failed to update ticket status' });
  }
};

// Delete ticket (admin)
export const deleteTicket = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      'DELETE FROM support_tickets WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    res.json({ message: 'Ticket deleted successfully' });
  } catch (error) {
    console.error('Delete ticket error:', error);
    res.status(500).json({ message: 'Failed to delete ticket' });
  }
};
