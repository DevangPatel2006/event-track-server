const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const fs = require('fs/promises');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Simple Hardcoded Auth
const ADMINS = [
  { email: 'admin1@event.com', password: 'password123', name: 'Admin One' },
  { email: 'admin2@event.com', password: 'password123', name: 'Admin Two' },
  { email: 'admin3@event.com', password: 'password123', name: 'Admin Three' },
  { email: 'admin4@event.com', password: 'password123', name: 'Admin Four' },
  { email: 'admin5@event.com', password: 'password123', name: 'Admin Five' },
];

const DATA_FILE = path.join(__dirname, 'data', 'timeline.json');

// Middleware
app.use(cors());
app.use(express.json());

const io = new Server(server, {
  cors: {
    origin: '*', // Allow all for now, or specify client URL
    methods: ['GET', 'POST']
  }
});

// State
let timeline = [];

// Load Data
async function loadData() {
  try {
    const data = await fs.readFile(DATA_FILE, 'utf-8');
    timeline = JSON.parse(data);
    console.log('Data loaded:', timeline.length, 'items');
  } catch (err) {
    console.error('Error loading data, initializing empty:', err);
    timeline = [];
  }
}

// Save Data
async function saveData() {
  try {
    await fs.writeFile(DATA_FILE, JSON.stringify(timeline, null, 2));
    console.log('Data saved');
    // Broadcast update
    io.emit('timeline:data', timeline);
  } catch (err) {
    console.error('Error saving data:', err);
  }
}

// Routes
app.get('/', (req, res) => {
  res.send('Event Timeline API Running');
});

// Auth Route
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const admin = ADMINS.find(a => a.email === email && a.password === password);
  
  if (admin) {
    return res.json({ 
      success: true, 
      user: { email: admin.email, name: admin.name, role: 'admin' },
      token: 'mock-jwt-token-secretary-protocol' // Client can store this
    });
  }
  
  return res.status(401).json({ success: false, message: 'Invalid credentials' });
});

// Timeline Routes
app.get('/api/timeline', (req, res) => {
  res.json(timeline);
});

// Admin Routes (Mock middleware protection)
app.post('/api/timeline', async (req, res) => {
  const newItem = { 
    id: Date.now().toString(), 
    ...req.body, 
    status: 'upcoming',
    actual_start: null,
    actual_end: null,
    remarks: ''
  };
  timeline.push(newItem);
  await saveData();
  res.json(newItem);
});

app.put('/api/timeline/:id', async (req, res) => {
  const { id } = req.params;
  const index = timeline.findIndex(t => t.id === id);
  if (index === -1) return res.status(404).json({ error: 'Item not found' });
  
  timeline[index] = { ...timeline[index], ...req.body };
  await saveData();
  res.json(timeline[index]);
});

app.delete('/api/timeline/:id', async (req, res) => {
  const { id } = req.params;
  timeline = timeline.filter(t => t.id !== id);
  await saveData();
  res.json({ success: true });
});

// Socket.IO
io.on('connection', (socket) => {
  // Send initial data
  socket.emit('timeline:data', timeline);

  // Admin Actions
  socket.on('admin:start_item', async (id) => {
    const now = new Date().toISOString();
    let changed = false;

    // Logic: Start one item, end previous live item if any
    timeline = timeline.map(item => {
      // If this is the item to start
      if (item.id === id) {
        if (item.status !== 'live') {
          changed = true;
          // Reset end time if restarting
          return { ...item, status: 'live', actual_start: now, actual_end: null };
        }
      } 
      // If another item is live, mark it completed
      else if (item.status === 'live') {
        changed = true;
        return { ...item, status: 'completed', actual_end: now };
      }
      return item;
    });

    if (changed) {
        await saveData();
        io.emit('timeline:data', timeline);
    }
  });

  socket.on('admin:end_item', async (id) => {
    const now = new Date().toISOString();
    const index = timeline.findIndex(t => t.id === id);
    if (index !== -1 && timeline[index].status === 'live') {
      timeline[index].status = 'completed';
      timeline[index].actual_end = now;
      await saveData();
      io.emit('timeline:data', timeline);
    }
  });

    socket.on('admin:delay_item', async ({ id, delayMinutes }) => {
     const index = timeline.findIndex(t => t.id === id);
     if (index !== -1) {
         timeline[index].status = 'delayed';
         await saveData();
         io.emit('timeline:data', timeline);
     }
  });

  socket.on('admin:update_remark', async ({ id, remark }) => {
      const index = timeline.findIndex(t => t.id === id);
      if (index !== -1) {
          timeline[index].remarks = remark;
          await saveData();
          io.emit('timeline:data', timeline);
      }
  });
  
  socket.on('admin:reset_item', async (id) => {
      const index = timeline.findIndex(t => t.id === id);
      if (index !== -1) {
          timeline[index].status = 'upcoming';
          timeline[index].actual_start = null;
          timeline[index].actual_end = null;
          timeline[index].remarks = ''; 
          await saveData();
          io.emit('timeline:data', timeline);
      }
  });
});

const PORT = 3000;
server.listen(PORT, async () => {
  await loadData();
  console.log(`Server running on port ${PORT}`);
});
