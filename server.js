const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const db = require('./database'); // Import Neon PostgreSQL connection

const app = express();

// Middleware
app.use(cors({
    origin: '*',
    credentials: true
}));
app.use(express.json());

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'cms-secret-key';

// ============ MIDDLEWARE ============
const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({ 
                success: false, 
                message: 'Access token required' 
            });
        }
        
        const decoded = jwt.verify(token, JWT_SECRET);
        
        // Get user from database
        const userResult = await db.query(
            'SELECT id, name, email, role FROM users WHERE id = $1',
            [decoded.id]
        );
        
        if (userResult.rows.length === 0) {
            return res.status(403).json({ 
                success: false, 
                message: 'User not found' 
            });
        }
        
        req.user = userResult.rows[0];
        next();
    } catch (error) {
        return res.status(403).json({ 
            success: false, 
            message: 'Invalid or expired token' 
        });
    }
};

const isAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({
            success: false,
            message: 'Admin access required'
        });
    }
    next();
};

// ============ AUTH ROUTES ============
app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, email, password, role } = req.body;
        
        // Validation
        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                message: 'All fields are required'
            });
        }
        
        // Check if user exists
        const existingUser = await db.query(
            'SELECT * FROM users WHERE email = $1',
            [email]
        );
        
        if (existingUser.rows.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'User already exists'
            });
        }
        
        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Create new user in Neon PostgreSQL
        const newUser = await db.query(
            `INSERT INTO users (name, email, password, role) 
             VALUES ($1, $2, $3, $4) 
             RETURNING id, name, email, role, created_at`,
            [name, email, hashedPassword, role || 'student']
        );
        
        // Generate token
        const token = jwt.sign(
            { 
                id: newUser.rows[0].id,
                email: newUser.rows[0].email,
                role: newUser.rows[0].role,
                name: newUser.rows[0].name
            },
            JWT_SECRET,
            { expiresIn: '24h' }
        );
        
        res.status(201).json({
            success: true,
            message: 'Registration successful',
            user: newUser.rows[0],
            token
        });
        
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error during registration'
        });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        // Validation
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email and password are required'
            });
        }
        
        // Find user in Neon PostgreSQL
        const userResult = await db.query(
            'SELECT * FROM users WHERE email = $1',
            [email]
        );
        
        if (userResult.rows.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }
        
        const user = userResult.rows[0];
        
        // Check password
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }
        
        // Generate token
        const token = jwt.sign(
            { 
                id: user.id,
                email: user.email,
                role: user.role,
                name: user.name
            },
            JWT_SECRET,
            { expiresIn: '24h' }
        );
        
        // Remove password from response
        const { password: _, ...userWithoutPassword } = user;
        
        res.json({
            success: true,
            message: 'Login successful',
            user: userWithoutPassword,
            token
        });
        
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error during login'
        });
    }
});

// ============ COURSE ROUTES ============
app.get('/api/courses', authenticateToken, async (req, res) => {
    try {
        const coursesResult = await db.query(
            'SELECT *, (capacity - enrolled) as available_seats FROM courses'
        );
        
        res.json({
            success: true,
            count: coursesResult.rows.length,
            courses: coursesResult.rows
        });
    } catch (error) {
        console.error('Get courses error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching courses'
        });
    }
});

app.post('/api/courses', authenticateToken, isAdmin, async (req, res) => {
    try {
        const { title, description, instructor, credits, schedule, capacity, duration } = req.body;
        
        // Validation
        if (!title || !description || !instructor || !credits || !schedule || !capacity) {
            return res.status(400).json({
                success: false,
                message: 'All fields are required'
            });
        }
        
        const newCourse = await db.query(
            `INSERT INTO courses (title, description, instructor, credits, schedule, capacity, duration) 
             VALUES ($1, $2, $3, $4, $5, $6, $7) 
             RETURNING *`,
            [title, description, instructor, credits, schedule, capacity, duration || '12 weeks']
        );
        
        res.status(201).json({
            success: true,
            message: 'Course created successfully',
            course: newCourse.rows[0]
        });
        
    } catch (error) {
        console.error('Create course error:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating course'
        });
    }
});

// ============ ENROLLMENT ROUTES ============
app.post('/api/enrollments', authenticateToken, async (req, res) => {
    try {
        const { courseId } = req.body;
        const userId = req.user.id;
        
        if (!courseId) {
            return res.status(400).json({
                success: false,
                message: 'Course ID is required'
            });
        }
        
        // Check if course exists and has capacity
        const courseResult = await db.query(
            'SELECT * FROM courses WHERE id = $1 FOR UPDATE',
            [courseId]
        );
        
        if (courseResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Course not found'
            });
        }
        
        const course = courseResult.rows[0];
        
        if (course.enrolled >= course.capacity) {
            return res.status(400).json({
                success: false,
                message: 'Course is full'
            });
        }
        
        // Check if already enrolled (using transaction)
        const client = await db.pool.connect();
        try {
            await client.query('BEGIN');
            
            const existingEnrollment = await client.query(
                'SELECT * FROM enrollments WHERE user_id = $1 AND course_id = $2',
                [userId, courseId]
            );
            
            if (existingEnrollment.rows.length > 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    success: false,
                    message: 'Already enrolled in this course'
                });
            }
            
            // Create enrollment
            const enrollmentResult = await client.query(
                `INSERT INTO enrollments (user_id, course_id) 
                 VALUES ($1, $2) 
                 RETURNING *`,
                [userId, courseId]
            );
            
            // Update course enrollment count
            await client.query(
                'UPDATE courses SET enrolled = enrolled + 1 WHERE id = $1',
                [courseId]
            );
            
            await client.query('COMMIT');
            
            res.status(201).json({
                success: true,
                message: 'Enrolled successfully',
                enrollment: {
                    ...enrollmentResult.rows[0],
                    courseTitle: course.title,
                    courseDescription: course.description,
                    instructor: course.instructor,
                    schedule: course.schedule
                }
            });
            
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
        
    } catch (error) {
        console.error('Enrollment error:', error);
        res.status(500).json({
            success: false,
            message: 'Error enrolling in course'
        });
    }
});

app.get('/api/enrollments/my-courses', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        
        const enrollmentsResult = await db.query(
            `SELECT e.*, c.title, c.description, c.instructor, c.credits, c.schedule, c.duration
             FROM enrollments e
             JOIN courses c ON e.course_id = c.id
             WHERE e.user_id = $1
             ORDER BY e.enrolled_at DESC`,
            [userId]
        );
        
        res.json({
            success: true,
            count: enrollmentsResult.rows.length,
            enrollments: enrollmentsResult.rows
        });
        
    } catch (error) {
        console.error('Get my courses error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching enrolled courses'
        });
    }
});

// ============ PROFILE ROUTE ============
app.get('/api/users/profile', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        
        // Get user with enrollment count
        const userResult = await db.query(
            `SELECT u.*, 
                    (SELECT COUNT(*) FROM enrollments WHERE user_id = u.id) as enrollment_count
             FROM users u
             WHERE u.id = $1`,
            [userId]
        );
        
        if (userResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        
        const user = userResult.rows[0];
        // Remove password from response
        delete user.password;
        
        res.json({
            success: true,
            user
        });
        
    } catch (error) {
        console.error('Profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching profile'
        });
    }
});

// ============ HEALTH & INFO ============
app.get('/health', async (req, res) => {
    try {
        const dbCheck = await db.query('SELECT NOW()');
        res.json({
            status: 'healthy',
            timestamp: new Date(),
            database: dbCheck ? 'connected' : 'disconnected',
            services: {
                database: 'Neon PostgreSQL',
                auth: 'JWT',
                status: 'operational'
            }
        });
    } catch (error) {
        res.status(500).json({
            status: 'unhealthy',
            error: error.message
        });
    }
});

app.get('/', (req, res) => {
    res.json({
        message: 'Course Management System API',
        version: '1.0.0',
        database: 'Neon PostgreSQL',
        status: 'running',
        endpoints: {
            auth: ['POST /api/auth/register', 'POST /api/auth/login'],
            courses: ['GET /api/courses', 'POST /api/courses (admin)'],
            enrollments: ['POST /api/enrollments', 'GET /api/enrollments/my-courses'],
            profile: 'GET /api/users/profile'
        }
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 CMS Backend running on port ${PORT}`);
    console.log(`📊 Database: Neon PostgreSQL`);
    console.log(`🔗 Base URL: http://localhost:${PORT}`);
    console.log(`🔐 Admin: admin@cms.com / admin123`);
});