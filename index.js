import express from "express"
import cors from "cors"
import mysql from "mysql"
import dotenv from "dotenv"
import mongoose from "mongoose"

const app = express();
dotenv.config();
app.use(cors())
app.use(express.json())//important for sending data
app.use(express.urlencoded({ limit: "25mb" }));

const db=mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'Slaves123#',
    database:'bank'
})

const mongoURI= process.env.Mongo_URI
mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => {
        console.log('MongoDB connected successfully');
    })
    .catch((err) => {
        console.error('Error connecting to MongoDB:', err);
    });



app.get('/',(req,res)=>{
    res.send('Express Server is working')
})

app.get('/users',(req,res)=>{
    res.send('Hello')
})

app.listen(8804,() => {
    console.log("listening on")
})