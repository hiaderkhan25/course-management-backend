const { Pool } = require('pg');
require('dotenv').config();

// Create connection pool to Neon PostgreSQL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false // Required for Neon
    }
});

// Initialize database tables (SIMPLIFIED VERSION)
const initializeDatabase = async () => {
    try {
        console.log('🔄 Initializing CMS database...');
        
        // ========== CREATE SIMPLIFIED TABLES ==========
        
        // 1. DROP existing tables if they exist (in correct order due to foreign keys)
        await pool.query('DROP TABLE IF EXISTS enrollments CASCADE');
        await pool.query('DROP TABLE IF EXISTS courses CASCADE');
        await pool.query('DROP TABLE IF EXISTS students CASCADE');
        console.log('✅ Old tables dropped');
        
        // 2. CREATE STUDENTS TABLE (No authentication needed)
        await pool.query(`
            CREATE TABLE students (
                student_id VARCHAR(20) PRIMARY KEY,
                full_name VARCHAR(100) NOT NULL,
                current_semester INTEGER NOT NULL,
                email VARCHAR(100),
                phone VARCHAR(15),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Students table created');
        
        // 3. CREATE COURSES TABLE (10 courses - 5 each semester)
        await pool.query(`
            CREATE TABLE courses (
                course_code VARCHAR(10) PRIMARY KEY,
                course_name VARCHAR(150) NOT NULL,
                description TEXT,
                semester INTEGER NOT NULL,
                credits INTEGER DEFAULT 3,
                instructor VARCHAR(100) NOT NULL,
                max_capacity INTEGER DEFAULT 40,
                current_enrollment INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Courses table created');
        
        // 4. CREATE ENROLLMENTS TABLE
        await pool.query(`
            CREATE TABLE enrollments (
                enrollment_id SERIAL PRIMARY KEY,
                student_id VARCHAR(20) REFERENCES students(student_id) ON DELETE CASCADE,
                course_code VARCHAR(10) REFERENCES courses(course_code) ON DELETE CASCADE,
                enrollment_date DATE DEFAULT CURRENT_DATE,
                status VARCHAR(20) DEFAULT 'Active',
                grade VARCHAR(2) DEFAULT NULL,
                CONSTRAINT unique_enrollment UNIQUE (student_id, course_code)
            )
        `);
        console.log('✅ Enrollments table created');
        
        // ========== INSERT DEFAULT DATA ==========
        
        // 5. INSERT DEFAULT STUDENT (Muhammad Haider)
        await pool.query(`
            INSERT INTO students (student_id, full_name, current_semester, email, phone) 
            VALUES ('CSC-23S-061', 'Muhammad Haider', 6, 'haider@example.com', '0300-1234567')
            ON CONFLICT (student_id) DO NOTHING
        `);
        console.log('✅ Default student inserted: Muhammad Haider (CSC-23S-061)');
        
        // 6. INSERT 6TH SEMESTER COURSES (5 courses)
        const semester6Courses = [
            ['CSC-601', 'Mobile App Development', 'Android and iOS application development with modern frameworks', 6, 'Sir Abid Ali', 35],
            ['CSC-602', 'Technical and Business Writing', 'Professional documentation and business communication skills', 6, 'Dr Muhammad Nawaz', 30],
            ['CSC-603', 'Computer Networks', 'Network protocols, security, and administration', 6, 'Sir Hamid Iqbal', 40],
            ['CSC-604', 'Artificial Intelligence', 'Machine learning algorithms and AI fundamentals', 6, 'Sir Fida Hussain Khoso', 35],
            ['CSC-605', 'Digital Image Processing', 'Image analysis, filtering, and computer vision basics', 6, 'Sir Maaz Ahmed', 30]
        ];
        
        for (const course of semester6Courses) {
            await pool.query(`
                INSERT INTO courses (course_code, course_name, description, semester, instructor, max_capacity) 
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (course_code) DO NOTHING
            `, course);
        }
        console.log('✅ 6th Semester courses inserted (5 courses)');
        
        // 7. INSERT 7TH SEMESTER COURSES (5 courses)
        const semester7Courses = [
            ['CSC-701', 'Cloud Computing', 'AWS, Azure, and cloud deployment strategies', 7, 'Prof. Lisa Martinez', 35],
            ['CSC-702', 'Cyber Security', 'Network security, cryptography, and ethical hacking', 7, 'Dr. James Anderson', 40],
            ['CSC-703', 'Software Engineering', 'Agile methodologies and software project management', 7, 'Prof. Karen Thomas', 30],
            ['CSC-704', 'Data Science', 'Big data analytics and machine learning models', 7, 'Dr. William Clark', 35],
            ['CSC-705', 'Internet of Things', 'IoT architecture, sensors, and practical applications', 7, 'Prof. Amanda Lewis', 40]
        ];
        
        for (const course of semester7Courses) {
            await pool.query(`
                INSERT INTO courses (course_code, course_name, description, semester, instructor, max_capacity) 
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (course_code) DO NOTHING
            `, course);
        }
        console.log('✅ 7th Semester courses inserted (5 courses)');
        
        // ========== VERIFY DATA ==========
        
        const studentCount = await pool.query('SELECT COUNT(*) FROM students');
        const courseCount = await pool.query('SELECT COUNT(*) FROM courses');
        const enrollmentCount = await pool.query('SELECT COUNT(*) FROM enrollments');
        
        console.log('\n📊 DATABASE SUMMARY:');
        console.log(`   Students: ${studentCount.rows[0].count}`);
        console.log(`   Courses: ${courseCount.rows[0].count} (10 total)`);
        console.log(`   Enrollments: ${enrollmentCount.rows[0].count}`);
        
        console.log('\n✅ Database initialization COMPLETE!');
        console.log('🎯 Ready to accept API requests...');
        
    } catch (error) {
        console.error('❌ Database initialization error:', error.message);
        console.error('Stack:', error.stack);
    }
};

// Test database connection
const testConnection = async () => {
    try {
        const client = await pool.connect();
        console.log('✅ Connected to Neon PostgreSQL database');
        
        // Test query
        const result = await client.query('SELECT NOW() as current_time');
        console.log(`   Database Time: ${result.rows[0].current_time}`);
        
        client.release();
        return true;
    } catch (error) {
        console.error('❌ Error connecting to Neon PostgreSQL:', error.message);
        return false;
    }
};

// Initialize when server starts
const initialize = async () => {
    const connected = await testConnection();
    if (connected) {
        await initializeDatabase();
    }
};

// Call initialize on require (for server startup)
initialize();

// Export query method and pool
module.exports = {
    query: (text, params) => pool.query(text, params),
    pool: pool,
    initializeDatabase: initializeDatabase,
    testConnection: testConnection
};