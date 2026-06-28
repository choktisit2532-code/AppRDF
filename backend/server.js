const express = require("express");
const cors = require("cors");
const supabase = require("./supabase");

const app = express();

app.use(cors());
app.use(express.json());

// TEST ROUTE
app.get("/", (req, res) => {
  res.send("NexInvoice API Running 🚀");
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

// PORT
const PORT = process.env.PORT;

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
