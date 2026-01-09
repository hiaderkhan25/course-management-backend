const express = require('express');
const cors = require('cors');
require('dotenv').config();
const db = require('./database'); // Import updated database connection

const app = express();

// Middleware
app.use(cors({
    origin: '*',
    credentials: true
}));
app.use(express.json());

// ============ COURSE ENDPOINTS ============
// GET all courses
app.get('/api/courses', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM courses ORDER BY semester, course_code');
        res.json(result.rows);
    } catch (error) {
        console.error('Get courses error:', error);
        res.status(500).json({ error: 'Error fetching courses' });
    }
});

// GET courses by semester
app.get('/api/courses/semester', async (req, res) => {
    try {
        const { semester } = req.query;
        
        if (!semester) {
            return res.status(400).json({ error: 'Semester parameter required' });
        }
        
        const result = await db.query(
            'SELECT * FROM courses WHERE semester = $1 ORDER BY course_code',
            [semester]
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Get courses by semester error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// ============ ENROLLMENT ENDPOINTS ============
// POST create enrollment
app.post('/api/enrollments', async (req, res) => {
    try {
        const { student_id, course_code } = req.body;
        
        if (!student_id || !course_code) {
            return res.status(400).json({ 
                success: false, 
                message: 'Student ID and Course Code are required' 
            });
        }
        
        // Check if student exists
        const studentResult = await db.query(
            'SELECT * FROM students WHERE student_id = $1',
            [student_id]
        );
        
        if (studentResult.rows.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Student not found' 
            });
        }
        
        // Check if course exists
        const courseResult = await db.query(
            'SELECT * FROM courses WHERE course_code = $1',
            [course_code]
        );
        
        if (courseResult.rows.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Course not found' 
            });
        }
        
        // Check if already enrolled
        const existingEnrollment = await db.query(
            'SELECT * FROM enrollments WHERE student_id = $1 AND course_code = $2',
            [student_id, course_code]
        );
        
        if (existingEnrollment.rows.length > 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Already enrolled in this course' 
            });
        }
        
        // Create enrollment
        const result = await db.query(
            `INSERT INTO enrollments (student_id, course_code, status) 
             VALUES ($1, $2, 'Active') 
             RETURNING *`,
            [student_id, course_code]
        );
        
        // Update course enrollment count
        await db.query(
            'UPDATE courses SET current_enrollment = current_enrollment + 1 WHERE course_code = $1',
            [course_code]
        );
        
        res.status(201).json({
            success: true,
            message: 'Enrollment created successfully',
            enrollment: result.rows[0]
        });
        
    } catch (error) {
        console.error('Create enrollment error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error creating enrollment' 
        });
    }
});

// GET student enrollments
app.get('/api/enrollments/student', async (req, res) => {
    try {
        const { student_id } = req.query;
        
        if (!student_id) {
            return res.status(400).json({ error: 'Student ID parameter required' });
        }
        
        const result = await db.query(
            `SELECT e.*, c.course_name, c.semester, c.instructor, s.full_name 
             FROM enrollments e
             JOIN courses c ON e.course_code = c.course_code
             JOIN students s ON e.student_id = s.student_id
             WHERE e.student_id = $1
             ORDER BY e.enrollment_date DESC`,
            [student_id]
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Get student enrollments error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET all enrollments (for admin)
app.get('/api/enrollments', async (req, res) => {
    try {
        const result = await db.query(
            `SELECT e.*, c.course_name, c.semester, c.instructor, s.full_name 
             FROM enrollments e
             JOIN courses c ON e.course_code = c.course_code
             JOIN students s ON e.student_id = s.student_id
             ORDER BY e.enrollment_date DESC`
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Get all enrollments error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// UPDATE enrollment status (drop)
app.put('/api/enrollments/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        
        if (!status) {
            return res.status(400).json({ 
                success: false, 
                message: 'Status is required' 
            });
        }
        
        // Get enrollment first to know course_code
        const enrollmentResult = await db.query(
            'SELECT * FROM enrollments WHERE enrollment_id = $1',
            [id]
        );
        
        if (enrollmentResult.rows.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Enrollment not found' 
            });
        }
        
        const enrollment = enrollmentResult.rows[0];
        
        // Update enrollment status
        const result = await db.query(
            `UPDATE enrollments 
             SET status = $1 
             WHERE enrollment_id = $2 
             RETURNING *`,
            [status, id]
        );
        
        // If dropping, decrease course enrollment count
        if (status === 'Dropped') {
            await db.query(
                'UPDATE courses SET current_enrollment = current_enrollment - 1 WHERE course_code = $1',
                [enrollment.course_code]
            );
        }
        
        res.json({
            success: true,
            message: 'Enrollment status updated successfully',
            enrollment: result.rows[0]
        });
        
    } catch (error) {
        console.error('Update enrollment error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error updating enrollment' 
        });
    }
});

// ============ STUDENT ENDPOINTS ============
// GET all students
app.get('/api/students', async (req, res) => {
    try {
        const result = await db.query(
            `SELECT s.*, 
                    (SELECT COUNT(*) FROM enrollments 
                     WHERE student_id = s.student_id AND status = 'Active') as active_enrollments
             FROM students s
             ORDER BY s.student_id`
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Get all students error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});


// ============ HEALTH CHECK ============
app.get('/health', async (req, res) => {
    try {
        const dbCheck = await db.query('SELECT NOW() as time, version() as version');
        res.json({
            status: 'healthy',
            timestamp: new Date(),
            database: {
                connected: true,
                time: dbCheck.rows[0].time,
                version: dbCheck.rows[0].version.split(' ')[1]
            },
            endpoints: {
                courses: ['GET /api/courses', 'GET /api/courses/semester?semester=6'],
                enrollments: ['GET /api/enrollments', 'GET /api/enrollments/student?student_id=CSC-23S-061', 'POST /api/enrollments', 'PUT /api/enrollments/:id/status'],
                students: 'GET /api/students',
                reset: 'POST /api/reset-database'
            }
        });
    } catch (error) {
        res.status(500).json({
            status: 'unhealthy',
            error: error.message
        });
    }
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        message: 'Course Management System API',
        version: '2.0.0',
        description: 'Simplified CMS - No Authentication Required',
        default_student: {
            id: 'CSC-23S-061',
            name: 'Muhammad Haider',
            semester: 6
        },
        courses_count: 10,
        endpoints: '/health'
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`\n🚀 CMS Backend Server Started`);
    console.log(`🔗 Port: ${PORT}`);
    console.log(`📊 Database: Neon PostgreSQL`);
    console.log(`🎓 Default Student: CSC-23S-061 (Muhammad Haider)`);
    console.log(`📚 Courses: 10 (Semester 6 & 7)`);
    console.log(`🌐 Health Check: http://localhost:${PORT}/health`);
    console.log(`🔄 Reset DB: POST http://localhost:${PORT}/api/reset-database`);
});