const { Pool } = require('pg');
require('dotenv').config();

// Create connection pool to Neon PostgreSQL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false // Required for Neon
    }
});

// Initialize database tables
const initializeDatabase = async () => {
    try {
        // Create users table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                email VARCHAR(100) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                role VARCHAR(20) DEFAULT 'student',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create courses table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS courses (
                id SERIAL PRIMARY KEY,
                title VARCHAR(200) NOT NULL,
                description TEXT,
                instructor VARCHAR(100) NOT NULL,
                credits INT DEFAULT 3,
                schedule VARCHAR(100),
                capacity INT DEFAULT 30,
                enrolled INT DEFAULT 0,
                duration VARCHAR(50) DEFAULT '12 weeks',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create enrollments table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS enrollments (
                id SERIAL PRIMARY KEY,
                user_id INT REFERENCES users(id) ON DELETE CASCADE,
                course_id INT REFERENCES courses(id) ON DELETE CASCADE,
                enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                status VARCHAR(20) DEFAULT 'active',
                UNIQUE(user_id, course_id)
            )
        `);

        // Insert default admin user if not exists
        const adminCheck = await pool.query(
            "SELECT * FROM users WHERE email = $1",
            ['admin@cms.com']
        );
        
        if (adminCheck.rows.length === 0) {
            const bcrypt = require('bcryptjs');
            const hashedPassword = await bcrypt.hash('admin123', 10);
            
            await pool.query(
                `INSERT INTO users (name, email, password, role) 
                 VALUES ($1, $2, $3, $4)`,
                ['Admin User', 'admin@cms.com', hashedPassword, 'admin']
            );
            console.log('✅ Admin user created');
        }

        // Insert sample courses if none exist
        const courseCheck = await pool.query("SELECT COUNT(*) FROM courses");
        if (parseInt(courseCheck.rows[0].count) === 0) {
            const sampleCourses = [
                ['Android Development', 'Learn Android app development with Java/Kotlin', 'John Doe', 3, 'Mon/Wed 10:00 AM', 30],
                ['Web Development', 'Full stack web development with React and Node.js', 'Jane Smith', 4, 'Tue/Thu 2:00 PM', 25],
                ['Data Structures', 'Fundamental data structures and algorithms', 'Robert Johnson', 3, 'Mon/Fri 11:00 AM', 35]
            ];

            for (const course of sampleCourses) {
                await pool.query(
                    `INSERT INTO courses (title, description, instructor, credits, schedule, capacity) 
                     VALUES ($1, $2, $3, $4, $5, $6)`,
                    course
                );
            }
            console.log('✅ Sample courses created');
        }

        console.log('✅ Database initialized successfully');
    } catch (error) {
        console.error('❌ Database initialization error:', error);
    }
};

// Test connection
pool.connect((err, client, release) => {
    if (err) {
        console.error('❌ Error connecting to Neon PostgreSQL:', err.message);
    } else {
        console.log('✅ Connected to Neon PostgreSQL database');
        release();
        initializeDatabase();
    }
});

module.exports = {
    query: (text, params) => pool.query(text, params),
    pool
};