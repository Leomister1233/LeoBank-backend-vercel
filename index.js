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
import { get } from "http";

// Configuration
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config();


// Express App Setup
const app = express();
app.use(express.json()); // Important for sending data
app.use(express.urlencoded({ limit: "25mb" }));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(cors({
    origin:["http://localhost:3000"],
    method:["POST","GET"],
    credentials:true
}));

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

app.get('/users',(req,res)=>{
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
          return res.status(404).json('ERROR');
      }
      
      return res.status(200).json(data);
  });
})

app.post('/login1',(re,res)=>{
  const user_id = re.body.user_id;
  const password = re.body.password;
  const sql="Select * from users where user_id =? and password_hash =?";
  db.query(sql, [user_id,password],
  (err,data)=> {
      if(err){
          return res.json(err);
      }
      if(data.length>0){
          return res.json("Success");
      }else{
          return res.json("Failed")
      }
  });
})

app.get('/checkidrole',(req,res)=>{
  const sql='Select user_id ,role from users where username=? and password_hash=?'
  const {username, password} = req.query;
  db.query(sql,[username,password],(err,data)=>{
      if(err) {
          console.error('Error fetching Id:', err);
          return res.status(500).json({error:'Error fetching accounts'});
      }
      return res.json(data);
  })
})

app.get('/profilecheck', async(req,res)=>{
  const user_id=req.query.user_id;
  try{
      const profile = await Profile.findOne({userid:user_id});
      if(!profile){
          return res.json({message:'Could not find the Info'})
      }
      //req.session.user = {userName}
      const {image,activated}=profile;
      return res.status(200).json({image,activated})
  }catch(error){
      console.log(error);
      return res.status(500).json({error:'Internal Server Error'})
  }
})

app.post('/loginconfirmation',async(req,res)=>{
  const userName=req.body.username;
  try{
      const activationToken = await ActivationToken.findOne({userName:userName});
      if(!activationToken){
          return res.json({message:'Invalid username or password'})
      }
      if(activationToken.activated !== true){
          return res.status(401).json({error:"Account not validate"})
      }
      return res.json({message:"Account validated"})
  }catch(error){
      console.log(error);
      return res.status(500).json({error:'Internal Server Error'})
  }
})

app.post('/createprofile',async (req,res)=>{
  const userid=req.body.user_id;
  console.log(userid)
  try{
      const profile = new Profile({userid})
      await profile.save();
      res.json({message:"Saved Successfully"})
  }catch(error){
      console.error('Error saving profile:', error);
      res.status(500).json({error:'Internal Server Error'})
  }
})

app.post('/activation', async (req,res)=>{
  const email=req.body.email;
  const userName=req.body.username;
  const token=generateActivationToken();
  console.log('Activation',token)
  const expireAt= new Date(Date.now()+ 5*60*1000);
  const activationToken = new ActivationToken({userName,email,token,expireAt})
  try{
      await activationToken.save();
      sendEmail1(email,token)
      console.log('after sending it ',email)
      res.json({message:"Activation link sent to your email",token:token})
  }catch(error){
      console.error('Error saving activation token:', error);
      res.status(500).json({error:'Internal Server Error'})
  }
})

app.post('/recoverotp', async (req,res)=>{
  const email=req.body.email;
  console.log(email)
  const otp=Math.floor(Math.random() * 9000 + 1000);
  const expireAt = new Date(Date.now()+60*1000);
  const security =await Security.findOne({email:email});
  if(!security){
      const security = new Security({email:email,recover_pin:otp,expireAt:expireAt})
      try{
          await security.save();
          sendEmail(email,otp);
          res.status(200).json({message:'Otp code sent to your email address'})
      }catch(err){
          console.log('Error saving OTP',err);
          res.status(500).json({error:"Internal Server Error"})
      }
  }else{
      security.recover_pin=otp;
      await security.save();
      res.status(200).json({message:'Otp code sent to your email address'})
  }
  
})

app.post('/activate', async (req,res)=>{
  const token= req.body.token;
  console.log('Activated in the backend',token);
  try{
      const activationToken = await ActivationToken.findOne({token:token});
      if(!activationToken){
          return res.status(400).json({error:'Invalid or expired activation token'})
      }
      if(activationToken.expireAt <= new Date(Date.now()+ 5*60*1000)) {
          return res.status(400).json({error:'Activation token expired'});
      }
      activationToken.activated = true;
      await activationToken.save();
      //res.redirect('https://localhost:3000/')
  }catch(error){
      console.log(error);
      return res.status(500).json({error:'Internal Server Error'});
  }
})

app.post('/createaccount',(re,res)=>{
  const sql="INSERT INTO accounts (user_id,account_type,full_name,address,country) values(?)"
  const values=[
      re.body.user_id,
      re.body.account_type,
      re.body.full_name,
      re.body.address,
      re.body.country
  ];
  console.log(values)
  db.query(sql,[values],(err,data)=>{
      if(err){
          return res.json('ERROR');
      } 
      return res.json(data);
  });
})

app.get('/getaccounts',(req,res) => {
  const sql="Select * from accounts"
  db.query(sql,(err,data)=>{
      if(err) {
          console.error('Error fetching accounts:', err);
          return res.status(500).json({error:'Error fetching accounts'});
      }
      return res.json(data);
  })
})

app.get('/getaccountslimit',(req,res) => {
  const sql="Select * from accounts ORDER BY created_at DESC LIMIT 5"
  db.query(sql,(err,data)=>{
      if(err) {
          console.error('Error fetching accounts:', err);
          return res.status(500).json({error:'Error fetching accounts'});
      }
      return res.json(data);
  })
})

app.get('/showbalance', (req, res) => {
  const sql='SELECT balance from accounts where account_id=?';
  const id=req.query.account_id;
  db.query(sql,[id],(err,data)=>{
      if(err){
          console.error('Error getting the balance', err)
          return res.status(500).json({error:'Error getting the balance'});
      }
      return res.json(data)
  })
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
