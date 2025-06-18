const db = require("./db/connect_db");
const routes = require("./routes");

const cors = require("cors");
const express = require("express");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
    console.log(req.path, req.method);
    next();
});

app.set("trust proxy", true);

db.connect();

routes(app);
app.get("/", (req, res) => {
    res.send("Backend is working! ✅");
  });

app.listen(process.env.PORT, () => {
    console.log("Backend server running on port", process.env.PORT);
});
