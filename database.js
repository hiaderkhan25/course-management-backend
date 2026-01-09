const { Pool } = require('pg');
require('dotenv').config();

// Create connection pool to Neon PostgreSQL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false // Required for Neon
    }
});

// ONLY create tables if they don't exist (NO DROPPING!)
const initializeDatabase = async () => {
    try {
        console.log('🔄 Checking CMS database structure...');
        
        // ========== CREATE TABLES IF THEY DON'T EXIST ==========
        
        // 1. CREATE STUDENTS TABLE IF NOT EXISTS
        await pool.query(`
            CREATE TABLE IF NOT EXISTS students (
                student_id VARCHAR(20) PRIMARY KEY,
                full_name VARCHAR(100) NOT NULL,
                current_semester INTEGER NOT NULL,
                email VARCHAR(100),
                phone VARCHAR(15),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Students table ready');
        
        // 2. CREATE COURSES TABLE IF NOT EXISTS (10 courses)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS courses (
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
        console.log('✅ Courses table ready');
        
        // 3. CREATE ENROLLMENTS TABLE IF NOT EXISTS
        await pool.query(`
            CREATE TABLE IF NOT EXISTS enrollments (
                enrollment_id SERIAL PRIMARY KEY,
                student_id VARCHAR(20) REFERENCES students(student_id) ON DELETE CASCADE,
                course_code VARCHAR(10) REFERENCES courses(course_code) ON DELETE CASCADE,
                enrollment_date DATE DEFAULT CURRENT_DATE,
                status VARCHAR(20) DEFAULT 'Active',
                grade VARCHAR(2) DEFAULT NULL,
                CONSTRAINT unique_enrollment UNIQUE (student_id, course_code)
            )
        `);
        console.log('✅ Enrollments table ready');
        
        // ========== INSERT DEFAULT DATA ONLY IF EMPTY ==========
        
        // 4. INSERT DEFAULT STUDENT ONLY IF NOT EXISTS
        await pool.query(`
            INSERT INTO students (student_id, full_name, current_semester, email, phone) 
            VALUES ('CSC-23S-061', 'Muhammad Haider', 6, 'haider@example.com', '0300-1234567')
            ON CONFLICT (student_id) DO NOTHING
        `);
        
        // 5. INSERT 6TH SEMESTER COURSES ONLY IF NOT EXISTS
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
        
        // 6. INSERT 7TH SEMESTER COURSES ONLY IF NOT EXISTS
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
        
        // ========== VERIFY CURRENT DATA ==========
        
        const studentCount = await pool.query('SELECT COUNT(*) FROM students');
        const courseCount = await pool.query('SELECT COUNT(*) FROM courses');
        const enrollmentCount = await pool.query('SELECT COUNT(*) FROM enrollments');
        
        console.log('\n📊 DATABASE STATUS:');
        console.log(`   Students: ${studentCount.rows[0].count}`);
        console.log(`   Courses: ${courseCount.rows[0].count}`);
        console.log(`   Enrollments: ${enrollmentCount.rows[0].count}`);
        
        console.log('\n✅ Database is READY!');
        console.log('💾 Data will PERSIST across server restarts');
        
    } catch (error) {
        console.error('❌ Database setup error:', error.message);
    }
};

// Test database connection
const testConnection = async () => {
    try {
        const client = await pool.connect();
        console.log('✅ Connected to Neon PostgreSQL database');
        
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

// Export query method and pool
module.exports = {
    query: (text, params) => pool.query(text, params),
    pool: pool,
    initializeDatabase: initializeDatabase,
    testConnection: testConnection
};