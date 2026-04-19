const express = require("express");
const router = express.Router();

const { setPrice, getCurrentPrice } = require("../controllers/priceController");

router.post("/set", setPrice);
router.get("/current", getCurrentPrice);

module.exports = router;
