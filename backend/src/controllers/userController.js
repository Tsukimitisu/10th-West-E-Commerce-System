import pool from '../config/database.js'
import bcrypt from 'bcryptjs'

export const getprofile = async (req, res)=>{
  try {
    const result = await pool.query(
      'SELECT id, name, role, phone, avatar, store_credit, created_at FROM users WHERE id = $1',
      [req.user.id]
    );

    if(result.row.length === 0){
      return res.status(404).json({message: 'User not found'});
    }

    const user = result.rows[0];
    res.json({
      ...user,
      store_credit: parseFloat(user.store_credit || 0)
    });
  } catch (error){
    console.error('Get profile error:', error);
    res.status(500).json({message: 'Server error'});
  }
};

export const updateProfile = async (req, res) =>{
  const {name, phone, avatar} = req.body;

  try {
    const result = await pool.query(
      `UPDATE users
      SET name = COALESCE($1, name),
        phone = COALESCE($2, phone),
        avatar = COALESCE($3, avatar),
        updated_at = CURRENT_TIMESTAMP
        WHERE id = $4
        RETURNING id, name, email, role, phone, avatar, store_credit, created_at`,
        [name, phone, avatar, req.user.id]
    );

    if(result.rows.length === 0){
      return res.status(404),json({message: 'User not found'});
    }

    const user = result.rows[0];
    res.json({
      message: 'Profile updated successfully',
      user: {
        ...user,
        store_credit: parseFloat(user.store_credit || 0)
      }
    });
  }catch (error){
    console.error('Update profile error:', error);
    res.status(500).json({message: 'Failed to update profile'});
  }
};

export const changePassword = async (req, res) => {
  const {oldPassword, newPassword } = req.body;

  if(!oldPassword || !newPassword){
    return res.status(400).json({message: 'Old password and new password are required'});
  }

  if (newPassword.length < 8){
    return res.status(400).json({message: 'New password must be at least 8 characters'});
  }

  try {
    const userResult = await pool.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [req.user.id]
    );

    if(userResult.rows.length === 0){
      return res.status(404).json({message: 'User not found'});
    }
      const user = userResult.row[0];

  const isvalid = await bcrypt.compare(oldPassword,user.password_hash);

if (!isvalid){
  return res.status(401).json({message: 'Current password is incorrect'});

}

const newPasswordHash = await bcrypt.hash(newPassword, 10)

await pool.query(
  'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
 [newPasswordHash, req.user.id] 
);

res.json({message: 'password change Successfullt'});
  }catch (error){
    console.error('Change password error', error);
    res.status(500).json({message: 'Failed to change password'});
  };
}

