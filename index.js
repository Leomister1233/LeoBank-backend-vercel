import express from "express"
import cors from "cors"

const app = express();
app.use(cors())
app.use(express.json())//important for sending data
app.use(express.urlencoded({ limit: "25mb" }));


app.listen(8804,() => {
    console.log("listening on")
})