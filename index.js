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


const store = new MongoDBStoreInstance({
    uri: mongoURI,
    collection:'session',
});



app.use(
    session({
        secret: 'slaves123#',
        resave: false,
        saveUninitialized: false,
        rolling: false,
        store: store, // Your session store configuration
        cookie: {
            secure: true, // Set to true in production with HTTPS
            maxAge: 30 * 60 * 1000 // 30 minutes expiration
        }
    })
);

// Other middleware and route handlers come after the session middleware
const sessionStore = store;

const storage = multer.diskStorage({
    destination:'uploads',
    filename:function (req,file,cb){
        cb(null,file.fieldname+'-' + Date.now() + path.extname(file.originalname));
    }
})

const upload = multer({storage:storage})
app.post('/upload',upload.single('image'), async (req, res) => {
    try{
        const userid=req.body.user_id;
        const image =req.file.filename;
        const profile = await Profile.findOne({userid:userid});
        if(!profile){
            return res.status(404).send('Profile not found');
        }
        profile.image=image;
        await profile.save();
        res.status(200).send('Image saved successfully')
    }catch(err){
        console.error('Error updating image:', err)
        res.status(500).send('Error updating profile image')
    }    
});

app.post('/uploadrates',upload.single('image'),async(req,res)=>{
    try{
        const currency = req.body.currency;
        const rate = req.body.rate;
        const image = req.file.filename;
        const rates = new Rates({currency,rates:rate,image});
        if(!rates){
            return res.status(404).send('Rate not found');
        }
        await rates.save()
        return res.status(200).send('Info Saved')
    }catch(err){
        console.error('Error inputing info:',err)
        res.status(500).send('Error uploading')
    }
    
})

const hashPassword = (password) => {
    return new Promise((resolve, reject) => {
        const salt = crypto.randomBytes(16).toString('hex'); // Generate a random salt
        const iterations = 10000;
        const keylen = 64;
        const digest = 'sha512';

        crypto.pbkdf2(password, salt, iterations, keylen, digest, (err, derivedKey) => {
            if (err) reject(err);
            const hashedPassword = `${salt}:${iterations}:${derivedKey.toString('hex')}`;
            resolve(hashedPassword);
        });
    });
};

const verifyPassword = (password, hashedPassword) => {
    return new Promise((resolve, reject) => {
        const [salt, iterations, storedHash] = hashedPassword.split(':');
        const keylen = 64;
        const digest = 'sha512';

        crypto.pbkdf2(password, salt, parseInt(iterations), keylen, digest, (err, derivedKey) => {
            if (err) reject(err);
            resolve(storedHash === derivedKey.toString('hex'));
        });
    });
};

app.get('/api/getRates', async(req,res)=>{
    try{
        const data = await Rates.find({}, {currency:1, rates: 1, _id: 0 })
        return res.status(200).json(data);
    }catch(err){
        console.error('Error getting rates:',err)
        return res.status(500).send('Error getting rates')
    }
})

app.use('/uploads', express.static(path.join(__dirname,'uploads')));

app.get('/api/getimagebyId', async(req,res)=>{
    try{
        const userid= req.query.user_id;
        const profile = await Profile.findOne({userid:userid})
        if(!profile){
            return res.status(404).json({message:"Profile not found"})
        }
        if(profile.image){
            const imageBase64 = profile.image;
            const imagePath= path.join(__dirname, 'uploads', imageBase64)
            res.sendFile(imagePath);
            return  res.status(200)
        }else{
            res.status(404).send('Image not found')
        }
    }catch(err){
        console.log('ERROR',err);
        res.status(500).send('Error retrieving profile')
    }
})

app.get('/api/checkepiration',async (req,res)=>{
    const sessionId=req.session.user_id;
    console.log(req.session.user_id);

    if(!sessionId){
        return res.status(401).json({error:"Session ID not found, please login"});
    }

    sessionStore.get(sessionId,( err, session)=>{
        if(err || !session){
            return res.status(401).json({error:'Session expired, please login'})
        }

        res.json({message:'Session valid'})
    })
})
app.post('/login',(req,res)=>{
    const name = req.body.username;
    const password = req.body.password;
    //console.log(req,res)
    const sql="Select user_id from users where username =? and password_hash =?";
    db.query(sql, [name,password],
    (err,data)=> {
        if(err){
            return res.json(err);
        }
        if(data.length>0){
            const userId=data[0].user_id;
            req.session.user_id = {userId};
            //console.log(req.session)
            return res.json("Success");
        }else{
            return res.json("Failed")
        }
    });
})

app.post('/logout',(req,res)=>{
    req.session.destroy((err)=>{
        if(err){
            console.log('Error destroying session',err);
            return res.status(500).json({error:'Error destroying'})
        }
    })
    res.json({message:'Logout successful'})
})


app.get('/api/getinfouser',async (req,res)=>{
    const token= req.query.token;
    try{
        const activationToken = await ActivationToken.findOne({token:token});
        if(!activationToken){
            return res.status(400).json({error:'Invalid or expired activation token'})
        }
        const {userName , email}=activationToken;
        return res.status(200).json({userName,email})
        //res.redirect('https://localhost:3000/')
    }catch(error){
        console.log(error);
        return res.status(500).json({error:'Internal Server Error'});
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

app.get('/api/check',async (req,res)=>{
    const userid=req.query.user_id;
    try{
        const profile = await profile.findOne({user_id:userid});
        if(profile){
            return res.json({message:"Profile exists"});
        }else{
            return res.status(404).json({message:"Profile not found"})
        }
    }catch(error){
        console.log(error);
        return res.status(500).json({error:'Internal Server Error'});
    }
})
app.get('/api/getuserIDbyName', async (req,res)=>{
    const username=req.query.username;
    console.log(username);
    const email=req.query.email;
    console.log(email)
    const sql='select user_id from users where username=? and email=?'
    db.query(sql,[username,email],(err,data)=>{
        if(err) {
            console.error('Error fetching users:', err);
            return res.status(500).json({error:'Error fetching users'});
        }
        return res.json(data);
    })
})

// Routes
app.get('/', (req, res) => {
  res.send('Express Server is working');
});

app.get('/users', (req, res) => {
  const sql = "SELECT * FROM users";
  db.query(sql, (err, data) => {
    if (err) {
      console.error('Error fetching users:', err);
      return res.status(500).json({ error: 'Error fetching users' });
    }
    return res.json(data);
  });
});

//Registration methods
app.get('/api/users2',(re,res)=>{
    const sql="Select * from users"
    db.query(sql,(err,data)=>{
        if(err) {
            console.error('Error fetching users:', err);
            return res.status(500).json({error:'Error fetching users'});
        }
        return res.json(data);
    })
})

app.get('/api/userslimit',(re,res)=>{
    const sql="Select * from users ORDER BY created_at DESC LIMIT 5 "
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

//home page methods

app.get('/api/getbalance',(re,res)=>{
    const sql="Select balance from accounts"
    db.query(sql,(err,data)=>{
        if(err) {
            console.error('Error fetching users:', err);
            return res.status(500).json({error:'Error fetching users'});
        }
        return res.json(data);
    })
})


app.get('/api/getemail',(req,res)=>{
    const user_id=req.query.user_id;
    const sql='Select email from users where user_id=?';
    db.query(sql,[user_id],(err,data)=>{
        if(err){
            console.error('Error fetching email:', err);
            return res.status(500).json({error:'Error fetching email'});
        }
        return res.json(data);
    })
})


app.get('/api/getaccounts',(req,res) => {
    const sql="Select * from accounts"
    db.query(sql,(err,data)=>{
        if(err) {
            console.error('Error fetching accounts:', err);
            return res.status(500).json({error:'Error fetching accounts'});
        }
        return res.json(data);
    })
})


app.get('/api/getaccountslimit',(req,res) => {
    const sql="Select * from accounts ORDER BY created_at DESC LIMIT 5"
    db.query(sql,(err,data)=>{
        if(err) {
            console.error('Error fetching accounts:', err);
            return res.status(500).json({error:'Error fetching accounts'});
        }
        return res.json(data);
    })
})

app.post('/checkaccounts', (req, res)=>{
    const userId=req.body.user_id;
    const sql="select account_id from accounts where user_id=?"
    db.query(sql,userId,(err,data)=>{
        if (err) {
            console.error('Error querying database:', err);
            return res.status(500).json({ error: 'Internal server error' });
        }
        if (data.length > 0) {
            return res.json({ message: 'Account found', accounts: data });
        } else {
            return res.json({ message: 'Account not found' });
        }
    })
})


app.get('/api/getaccountsid',async(req,res) => {
    const sql="Select account_id from accounts where user_id=?"
    const user_id=req.query.user_id;
   // console.log(req.session)
    db.query(sql,user_id,(err,data)=>{
        if(err) {
            console.error('Error fetching account Id', err);
            return res.status(500).json({error:'Error fetching accounts'});
        }
        if(user_id===""){
            console.error('Error fetching account Id:', err);
            return res.status(500).json({error:'Error fetching'});
        }
        else{
             // Check if data is empty or not
             if (data.length === 0) {
                return res.json({message:"Account activated successfully activated"});
            } else {
                return res.json(data);
            }
        }
    })
})


app.get('/getaccountinfo',(req,res)=>{
    const sql='select * from Accountview'
    db.query(sql,(err,data)=>{
        if(err){
            return res.status(500).json({error:"Error fetching accounts"})
        }
        else if(data.length === 0){
            return res.status(400).json({message:"No accounts found"})
        }
        return res.json(data)
    })
})


app.get('/api/getaccountsbyid',(req,res) => {
    const sql="select * from Accountview where account_id=?"
    const account_id=req.query.account_id;
    db.query(sql,account_id,(err,data)=>{
        if(err) {
            console.error('Error fetching account Id', err);
            return res.status(500).json({error:'Error fetching accounts'});
        }
        if(account_id===""){
            console.error('Error fetching account Id:', err);
            return res.status(500).json({error:'Error fetching'});
        }
        else{
            // Check if data is empty or not
            if (data.length === 0) {
                return res.status(404).json({ error: 'No accounts found for the user ID' });
            } else {
                return res.json(data);
            }
        }
    })

})

app.get('/api/getUsertransaction', (req, res) => {
    const account_id = req.query.account_id;
    if (!account_id) {
        console.error('Error fetching Transaction: Account ID is missing');
        return res.status(400).json({ error: 'Account ID is missing' });
    }
    const sql = "SELECT * FROM transactions WHERE (sender_account_id=? OR recipient_account_id=?) ORDER BY transaction_date DESC LIMIT 5";
    db.query(sql, [account_id, account_id], (err, data) => {
        if (err) {
            console.error('Error fetching Transaction', err);
            return res.status(500).json({ error: 'Error fetching Transaction' });
        } else {
            if (data.length === 0) {
                return res.json({ message: 'No transactions found for the account_id' });
            } else {
                return res.json(data);
            }
        }
    });
});

app.get('/api/getransactions', (req, res) => {   
    const sql = "SELECT * FROM transactions ORDER BY transaction_date DESC LIMIT 5";
    db.query(sql, (err, data) => {
        if (err) {
            console.error('Error fetching Transaction', err);
            return res.status(500).json({ error: 'Error fetching Transaction' });
        } else {
            if (data.length === 0) {
                return res.status(404).json({ error: 'No transactions found for the account_id' });
            } else {
                return res.json(data);
            }
        }
    });
});

app.get('/api/getransactions1', (req, res) => {
    const sql = "SELECT * FROM transactions";
    db.query(sql, (err, data) => {
        if (err) {
            console.error('Error fetching Transaction', err);
            return res.status(500).json({ error: 'Error fetching Transaction' });
        } else {
            if (data.length === 0) {
                return res.status(404).json({ error: 'No transactions found for the account_id' });
            } else {
                return res.json(data);
            }
        }
    });
});

app.post('/updatepin', async(req,res)=>{
    const userId=req.body.user_id;
    console.log(userId)
    const pin=req.body.pin;
    console.log(pin)
    try{
        const profile=  await Profile.findOne({userid: userId});
        if(!profile){
            return res.status(404).send('Profile not found');
        }
        profile.pincode=pin;
        profile.activated=true;
        profile.save();
        return res.status(200).json({message:'Changes applied successfully'});
    }catch(err){
        console.log(err);
    }
})

app.post('/updatequestions', async(req,res)=>{
    const email=req.body.email;
    const question=req.body.question;
    const answer= req.body.answer;
    try{
        const security = await Security.findOne({email:email})
        if(!security){
            const security= new Security({email:email,
            security_question:question,
            security_answer:answer
            });
            if(!security){
                return res.status(404).send('Security not found');
            }
            console.log(security)
            await security.save();
        }else{
            security.security_question=question;
            security.security_answer=answer; 
            await security.save();
        }
        console.log(security)
       
        return res.status(200).json({message:'Changes applied successfully'})
    }catch(err){
        console.log('Error',err)
    }
})

app.post('/disable', async (req,res)=>{
    const user=req.body.user_id;
    console.log(user)
    try{
        const profile = await Profile.findOne({userid:user});
        if(!profile){
            return res.status(404).send('Profile not found');
        }
        profile.activated=false;
        profile.save();
        return res.status(200).json({message: 'Changes applied successfully'});
    }catch(err){
        console.log('Error',err);
    }
})

app.get('/api/checkid',(req,res)=>{
    const sql="Select user_id from users where username=? and password_hash=?"
    const {username,password}=req.query;
    db.query(sql,[username,password],(err,data)=>{
        if(err) {
            console.error('Error fetching Id:', err);
            return res.status(500).json({error:'Error fetching accounts'});
        }
        return res.json(data);
    })
})

app.get('/api/checkidrole',(req,res)=>{
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

app.get('/api/showbalance', (req, res) => {
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

app.get('/login',(re,res)=>{
    const sql="Select username,password_hash from users"
    db.query(sql,(err,data)=>{
        if(err) return res.json(err);
        return res.json(data);
    })
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

app.get('/api/logout',(req,res)=>{
    const sessionId = req.sessionID;

    if(sessionId === req.sessionID){
        req.session.destroy(err => {
            if(err){
                console.error('Error destroying session:',err);
                res.status(500).send('Error logging out')
            }else{
                res.send('Logout successful')
            }
        })
    }else{
        res.status(403).send('Unauthorized');
    }
})

app.post('/checkemail',(re,res)=>{
    const email = re.body.email;
    const sql="Select * from users where email =?";
    db.query(sql, [email],
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

app.post('/borrower',(req,res)=>{
    const values =[
        req.body.user_id,
        req.body.account_id,
        req.body.full_name,
        req.body.loan_amount,
        req.body.loan_interest,
        req.body.loan_type,
        req.body.loan_reason,
    ]
    console.log(values)
    const sql='Insert into borrower (user_id,account_id,full_name,borrow_amount,interest_rate,loan_type,loan_reasons) values(?)'
    db.query(sql,[values],(data,err)=>{
        if(err){
            return res.json('Error')
        }
        return res.json(data)
    })
})

app.get('/api/borrower',(req,res)=>{
    const user_id=req.query.user_id;
    console.log(user_id)
    const account_id=req.query.account_id;
    console.log(account_id)
    const loan_type=req.query.loan_type;

    const sql = 'SELECT borrower_id from borrower where user_id=? and account_id=? and loan_type=?'
    db.query(sql,[user_id,account_id,loan_type],(err,data)=>{
        if(err){
            console.error('Error getting the borrower id', err)
            return res.status(500).json({error:'Error getting the balance'});
        }else if(!data || data.length === 0){
            console.error('No borrower found')
            return res.status(400).json({error:'No borrower found'})
        }
        return res.json(data)
    })
})

app.post('/loans',(req,res)=>{
    const values=[
        req.body.account_id,
        req.body.borrower_id,
        req.body.loan_paymenttype,
        req.body.payments,
        req.body.loan_term,
    ]
    console.log(values)
    const sql="insert into loans (account_id,borrower_id,typeofpayments,preset_amount,loan_term) values (?)"
    db.query(sql,[values],(data,err)=>{
        if(err){
            return res.json('Error')
        }
        return res.json(data)
    })
})

app.get('/loans', (req, res) => {
    const sql = 'SELECT * FROM loaninfo';
    db.query(sql, (err, data) => {
        if (err) {
            console.error('Error fetching loans:', err);
            return res.status(500).json({ error: 'internal_server_error' });
        } else if (data.length === 0) {
            return res.status(404).json({ message: 'No loans found!' });
        }
        return res.json(data);
    });
});

app.get('/api/loansbyuser', (req, res) => {
    const user_id = req.query.user_id;
    const sql = 'SELECT * FROM loaninfo WHERE user_id = ?';
    db.query(sql, [user_id], (err, data) => {
        if (err) {
            return res.status(500).json({ error: "Error getting the loan history" });
        } else if (data.length === 0) {
            return res.status(404).json({ message: "No loans found" });
        }
        return res.json(data);
    });
});

app.post('/deleteloan',(req,res)=>{
    const user_id=req.body.user_id;
    console.log(user_id);
    const sql="Delete from loaninfo where user_id=?"
    db.query(sql,[user_id],(err,data)=>{
        if(err){
            console.log('Error updating the row',err)
            return res.status(500).json({error:'Error updating the row'})
        }else{
            return res.status(200).json({message:"Deletion Successful"})
        }
    })
})

app.post('/deleteaccount',async(req,res)=>{
    const account_id= req.body.account_id;
    const sql = "Delete from accounts where account_id=?"
    db.query(sql,[account_id],(err,data)=>{
        if(err){
            console.log("Error deleting account")
            return res.status(404).json({error:"Error deleting account"})
        }else{
            return res.status(200).json({message:"Account deleted successfully"})
        }
    })
})


app.post('/updateApprove',(req,res)=>{
    const loan_id=req.body.loan_id;
    const sql="update loaninfo set status='Active' where loan_id=?";
    db.query(sql,[loan_id],(err,data)=>{
        if(err){
            console.log('Error updating the row',err)
            return res.status(500).json({error:'Error updating the row'})
        }else{
            return res.status(200).json({message:"Update Successful"})
        }
    })
})
app.post('/updateRejected',(req,res)=>{
    const loan_id=req.body.loan_id;
    const sql="update loaninfo set status='Rejected' where loan_id=?"
    db.query(sql,[loan_id],(err,data)=>{
        if(err){
            console.log('Error updating the row',err)
            return res.status(500).json({error:'Error updating the row'})
        }else{
            return res.status(200).json({message:"Update Successful"})
        }
    })
})

app.post('/transaction',(re,res)=>{
    const values=[
        re.body.account_id,
        re.body.transaction_type,
        re.body.recipient_account_id,
        re.body.amount,
        re.body.descriptions
    ];
    const sql="INSERT INTO transactions (sender_account_id,transaction_type,recipient_account_id,amount,description) values(?)";
    db.query(sql, [values],
        (err,data)=> {
            if(err){
                return res.json('ERROR');
            } 
            return res.json(data);
        }
    );
})

app.post('/deposit',(re,res)=>{
    const sql= "Update accounts Set balance = balance + ? where account_id = ?"
    const values=[
        re.body.amount,
        re.body.account_id
    ]
    db.query(sql,values,
        (err,data)=>{
            if(err){
                console.error('Erro updating account',err)
                return res.status(500).json({error:'Internal Server Error'})
            } 
            if(data.affectedRows > 0 ){
                return res.status(200).json({message:' Updated successfully'})
            }else{
                return res.status(404).json({error:'Account Id not found was not updated'})
            }
        })
})

app.get('/api/payeeinfo',(req,res)=>{
    const sql="select transaction_id from transactions where sender_account_id=? and recipient_account_id=?"
    const values =[
        req.query.sender_account_id,
        req.query.recipient_account_id
    ]
    db.query(sql,values,(err,data)=>{
        if(err) return res.json(err);
        return res.json(data);
    })
})

app.post('/payee',(req,res)=>{
    const sql= "Insert into payees(transaction_id, sender_account_id,recipient_account_id,payee_name,payee_type) values (?)"
    const values=[
        req.body.transaction_id,
        req.body.account_id,
        req.body.recipient_account_id,
        req.body.payee_name,
        req.body.payee_type,
    ]
    db.query(sql,[values],
        (err,data)=>{
            if (err) {
                console.error('Error inserting payee:', err);
                return res.status(500).json({ error: 'Internal Server Error' });
            }
            
            // Data successfully inserted
            return res.status(200).json({ message: 'Payee inserted successfully' });
        })
})

app.post('/transfer',(re,res)=>{
    const sql='Update accounts Set balance=balance-? where account_id=?';
    const values=[
        re.body.amount,
        re.body.account_id
    ]
    db.query(sql,values
        ,(err,data)=>{
            if(err){
                console.error('Erro updating account',err)
                return res.status(500).json({error:'Internal Server Error'})
            } 
            if(data.affectedRows > 0 ){
                return res.status(200).json({message:' Updated successfully'})
            }else{
                return res.status(404).json({error:'Account Id not found was not updated'})
            }
    })
})

app.post('/checkotp', async (req,res)=>{
    const otp=req.body.otp;
    console.log(otp);
    const email=req.body.email;
    console.log(email); 
    try{
        const security = await Security.findOne({email:email});
        if(!security){
            return res.status(404).json({message:"Doesn't exists"});
        }else if(security){
            if(security.recover_pin===otp){
                return res.status(200).json({message:"Security account found"})
            }else{
                return res.status(403).json({message:"Invalid security code"})
            }
        }
    }catch(error){
        console.log(error);
        return res.status(500).json({error:'Internal Server Error'});
    } 
    
})

app.post('/updateOtp',(re,res)=>{
    const{OTP, recipient_email} = re.body
    const sql="Update recovery Set otp=? where email=?"
    
    db.query(sql,[OTP,recipient_email],
        (err,data)=>{
            if(err){
                console.error('Error updating OTP',err)
                return res.status(500).json({error:'Internal Server Error'})
            } 

            if(data.affectedRows > 0 ){
                return res.status(200).json({message:'OTP Updated successfully'})
            }else{
                return res.status(404).json({error:'Email not found or OTP was not updated'})
            }
        });
})

app.post('/updatePassword',(re,res)=>{
    const{password,email} = re.body;
    const sql="Update users Set password_hash=? where email=?"
    
    db.query(sql,[password,email],
        (err,data)=>{
            if(err){
                console.error('Error updating Password',err)
                return res.status(500).json({error:'Internal Server Error'})
            } 

            if(data.affectedRows > 0 ){
                return res.status(200).json({message:'Password Updated successfully'})
            }else{
                return res.status(404).json({error:'Email not found or OTP was not updated'})
            }
        });
})

app.post('/deleteuser',(re,res) => {
    const {username,email}=re.body;
    const sql="Delete from users where username = ? and email=?";
    db.query(sql,[username,email],
        (err,data) =>{
            if(err){
                console.error('Error deleting user', err);
                return res.status(500).json({error:'Internal Server Error'})
            }
            if(data.affectedRows > 0){
                return res.status(200).json({message:'User deleted successfully'});
            }else{
                return res.status(404).json({error:'Username or Email was not deleted successfully'});
            }
        }        
    )
})

app.post('/updateInfo',(req,res)=>{
    const {username,password,email}=req.body;
    const sql="UPDATE users SET username=?, password=?,email=? WHERE user_id=? "
    db.query(sql,[username,password,email],(err,data)=>{
        if(err){
            console.error('Error updating info',err)
            return res.status(500).json({error:'Internal Server Error'})
        } 
        if(data.affectedRows > 0 ){
            return res.status(200).json({message:'Info Updated successfully'})
        }else{
            return res.status(404).json({error:'Error , Info not updated successfully'})
        }
    })
})

app.get('/api/profilecheck', async(req,res)=>{
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

function setCookie(name, value) {
    var expires = "";
    document.cookie = name + "=" + value + expires + "; path=/";
}

app.post('/profilelogincheck', async(req,res)=>{
    const user_id=req.body.userId;
    //var userId = 'your_user_id';
    //setCookie('userId', userId);
    //setCookie('user_id',user_id);
    //console.log(req.session);
    try{
        const profile =await Profile.findOne({userid:user_id})
        if(!profile){
            return res.json({message:'Could not find the Info1'})
        }
        if(profile.activated=== true){
            return res.status(200).json({ message: 'Activated' });
        }else{
            return res.json({ message: 'Not Activated' });
        }
    }catch( error){
        console.log(error);
        return res.status(500).json({error:'Internal Server Error'})
    }
})
app.post('/pincheck', async (req,res) =>{
    const pincheck = req.body.pin;
    try{
        const profile =await Profile.findOne({pincode:pincheck})
        if(!profile){
           
            return res.status(404).json({message:"Could not find the account"})
        }
        if(profile.pincode === parseInt(pincheck)){
            return res.status(200).json({ message: 'Pincode verified successfully' });
            
        }

    }catch(err){
        console.log(err);
        return res.status(500).json({error:'Internal Server Error'})
    }
})

//Send Email section
app.use(express.urlencoded({ limit: "25mb" }));
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  next();
});

function sendEmail(recipient_email, OTP ) {
    return new Promise((resolve, reject) => {
      var transporter = nodemailer.createTransport({
        host: "smtp.office365.com", // Update with the SMTP server for Hotmail/Outlook
            port: 587, // TLS port
            secure: false, // Secure connection required
            auth: {
                user: "Leomisthr@outlook.pt",
                pass: "slaves12345",
            },
            tls: {
                ciphers: 'SSLv3',
                rejectUnauthorized: false
            }
      });
  
      const mail_configs = {
        from:"Leomisthr@outlook.pt" ,
        to: recipient_email,
        subject: "PASSWORD RECOVERY",
        html: `<!DOCTYPE html>
            <html lang="en" >
            <head>
                <meta charset="UTF-8">
                <title>CodePen - OTP Email Template</title>
                
            </head>
            <body>
            <!-- partial:index.partial.html -->
            <div style="font-family: Helvetica,Arial,sans-serif;min-width:1000px;overflow:auto;line-height:2">
                <div style="margin:50px auto;width:70%;padding:20px 0">
                <div style="border-bottom:1px solid #eee">
                    <a href="" style="font-size:1.4em;color: #00466a;text-decoration:none;font-weight:600">Leonardo Company</a>
                </div>
                <p style="font-size:1.1em">Hello,</p>
                <p> Use the following OTP to complete your Password Recovery Procedure. OTP is valid for 5 minutes</p>
                <h2 style="background: #00466a;margin: 0 auto;width: max-content;padding: 0 10px;color: #fff;border-radius: 4px;">${OTP}</h2>
                <p style="font-size:0.9em;">Regards,<br />Leonardo</p>
                <hr style="border:none;border-top:1px solid #eee" />
                <div style="float:right;padding:8px 0;color:#aaa;font-size:0.8em;line-height:1;font-weight:300">
                    <p>LEONARDO CARVALHO Inc</p>
                    <p>1600 Amphitheatre Parkway</p>
                    <p>Portugal</p>
                </div>
                </div>
            </div>
            <!-- partial -->
                
            </body>
            </html>`,
      };
      transporter.sendMail(mail_configs, function (error, info) {
        if (error) {
          console.log(error);
          return reject({ message: `An error has occured` });
        }
        return resolve({ message: "Email sent succesfuly" });
      });
    });
}

function sendEmail1( recipient_email,token) {
    return new Promise((resolve, reject) => {
      const  activationLink=`https://localhost:3000/activate?token=${token}`;
      var transporter = nodemailer.createTransport({
        host: "smtp.office365.com", // Update with the SMTP server for Hotmail/Outlook
            port: 587, // TLS port
            secure: false, // Secure connection required
            auth: {
                user: "Leomisthr@outlook.pt",
                pass: "slaves12345",
            },
            tls: {
                ciphers: 'SSLv3',
                rejectUnauthorized: false
            }
      });
  
      const mail_configs = {
        from:"Leomisthr@outlook.pt" ,
        to: recipient_email,
        subject: "Account Activation",
        html: `<!DOCTYPE html>
            <html lang="en" >
            <head>
                <meta charset="UTF-8">
                <title>CodePen - OTP Email Template</title>
                
            </head>
            <body>
            <!-- partial:index.partial.html -->
            <div style="font-family: Helvetica,Arial,sans-serif;min-width:1000px;overflow:auto;line-height:2">
                <div style="margin:50px auto;width:70%;padding:20px 0">
                <div style="border-bottom:1px solid #eee">
                    <a href="" style="font-size:1.4em;color: #00466a;text-decoration:none;font-weight:600">Bank of Leo</a>
                </div>
                <p style="font-size:1.1em">Hello,</p>
                <p> Use the following code to activate your account. Activation Code is valid for 5 minutes</p>
                <h2 style="background: #00466a;margin: 0 auto;width: max-content;padding: 0 10px;color: #fff;border-radius: 4px;">Activate Account within 5 minutes </h2>
                <a href="${activationLink}" target="_blank">${activationLink}</a> Click to activate your account
                <p style="font-size:0.9em;">Regards,<br />Leonardo</p>
                <hr style="border:none;border-top:1px solid #eee" />
                <div style="float:right;padding:8px 0;color:#aaa;font-size:0.8em;line-height:1;font-weight:300">
                    <p>Bank of Leo Inc</p>
                    <p>1600 Alto do Lumiar Lisboa </p>
                    <p>Portugal</p>
                </div>
                </div>
            </div>
            <!-- partial -->
                
            </body>
            </html>`,
      };
      transporter.sendMail(mail_configs, function (error, info) {
        if (error) {
          console.log(error);
          return reject({ sucess:false ,message: `An error has occured` });
        }
        return resolve({ sucess:true ,message: "Email sent succesfuly" });
      });
    });
}

app.get("/", (req, res) => {
    console.log(process.env.MY_EMAIL);
});

app.post("/send_recovery_email", (req, res) => {
    sendEmail(req.body)
      .then((response) => res.send(response.message))
      .catch((error) => res.status(500).send(error.message));
});

app.post("/sendactivation", (req, res) => {

    sendEmail1({ recipient_email: email, OTP: otp })
      .then((response) => res.send(response.message))
      .catch((error) => res.status(500).send(error.message));
});


app.post('/recovery',(re,res)=>{
    const sql="INSERT INTO PasswordResetRequests (email,otp,otp_expiration, is_active) values(?, ?, ?, ?)"
    const email=re.body.recipient_email
    const otp=e.body.OTP
    const otpexpiration=new Date(new Date().getTime() + 5 * 60000);
    const isActive=1;
    db.query(sql,[email,otp,otpexpiration,isActive],(err,data)=>{
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
