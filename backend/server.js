const API = "https://nexinvoice-api.onrender.com";
const express = require("express");
const cors = require("cors");
const supabase = require("./supabase");

const app = express();
app.use(cors());
app.use(express.json());

// TEST
app.get("/", (req, res) => {
  res.send("NexInvoice API Running");
});

// CREATE CUSTOMER
app.post("/customers", async (req, res) => {
  const { name, email, phone } = req.body;

  const { data, error } = await supabase
    .from("customers")
    .insert([{ name, email, phone }]);

  res.json({ data, error });
});

// GET CUSTOMERS
app.get("/customers", async (req, res) => {
  const { data, error } = await supabase
    .from("customers")
    .select("*");

  res.json({ data, error });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log("Server running on " + PORT));
