import codecs

with codecs.open('../frontend/App.jsx', 'r', 'utf-8') as f:
    text = f.read()

text = text.replace(
    "import Register from './pages/Register';",
    "import Register from './pages/Register';\nimport VerifyEmail from './pages/VerifyEmail';"
)

text = text.replace(
    '<Route path="/register" element={<Register onLogin={handleLogin} />} />',
    '<Route path="/register" element={<Register onLogin={handleLogin} />} />\n              <Route path="/verify-email" element={<VerifyEmail />} />'
)

with codecs.open('../frontend/App.jsx', 'w', 'utf-8') as f:
    f.write(text)
