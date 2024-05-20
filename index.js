import express from "express";
import mysql from "mysql";
import cors from "cors";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import fs from "fs";
import bodyParser from "body-parser";
import crypto from "crypto";
import session from "express-session";
import mongoose from "mongoose";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import cookieParser from "cookie-parser";

// Configuration
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config();


// Express App Setup
const app = express();
app.use(cors());
app.use(express.json()); // Important for sending data
app.use(express.urlencoded({ limit: "25mb" }));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());

// MySQL Database Connection
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
});

// MongoDB Connection
const mongoURI = process.env.MONGO_URI;
mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    console.log('MongoDB connected successfully');
  })
  .catch((err) => {
    console.error('Error connecting to MongoDB:', err);
  });


  const ActivationToken = mongoose.model('ActivationToken',{
    userName:String,
    email:String,
    token:String,
    expiresAt:Date,
    activated:{type:Boolean,default:false}
});

const Profile = mongoose.model('Profile',{
    userid:String,
    image:{type:String,default:null},
    pincode:{type:Number,default:1234},
    activated:{type:Boolean,default:false}
})

const Security = mongoose.model('Security',{
    email:{type:String,default:null},
    security_question:{type:String,default:null},
    security_answer:{type:String,default:null},
    recover_pin:{type:String,default:null},
    transaction_pin:{type:String,default:null},
    expiresAt:Date
});

const Rates = mongoose.model('Rates',{
    currency:{type:String,default:null},
    rates:{type:String,default:null},
    image:{type:String,default:null}
})

app.get('/',(req,res)=>{
    res.send('Server is working')
})

app.get('/api/users',(re,res)=>{
    const sql="Select * from users"
    db.query(sql,(err,data)=>{
        if(err) {
            console.error('Error fetching users:', err);
            return res.status(500).json({error:'Error fetching users'});
        }
        return res.json(data);
    })
})

app.post('/users',(re,res)=>{
    const sql="INSERT INTO users (username, password_hash,email,full_name,date_of_birth,role) values(?)"
    const values=[
        re.body.username,
        re.body.password,
        re.body.email,
        re.body.full_name,
        re.body.date_of_birth,
        re.body.role
    ];

    db.query(sql,[values],(err,data)=>{
        if(err){
            return res.json('ERROR');
        }
        
        return res.json(data);
    });
})







// Start Server with Error Handling
const PORT = process.env.PORT || 8804;
const server = app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Please choose another port.`);
    process.exit(1);
  } else {
    console.error('Server error:', error);
  }
});
