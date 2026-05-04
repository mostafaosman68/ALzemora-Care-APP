const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { connect } = require('./database/init');

const app = express();
const PORT = process.env.PORT || 3000;

['uploads/patients', 'uploads/faces', 'uploads/voices', 'uploads/medications'].forEach(dir => {
  fs.mkdirSync(path.join(__dirname, '../../', dir), { recursive: true });
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, '../../uploads')));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/patients', require('./routes/patients'));
app.use('/api/patients/:patientId/heartbeat', require('./routes/heartbeat'));
app.use('/api/patients/:patientId/family', require('./routes/family'));
app.use('/api/patients/:patientId/medications', require('./routes/medications'));

app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

connect()
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Alzheimer Care API running on http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('Failed to connect to MongoDB:', err);
    process.exit(1);
  });

module.exports = app;
