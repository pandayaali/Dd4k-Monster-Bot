const express = require("express");
const fs = require("fs");

const router = express.Router();

router.get("/:batch", (req, res) => {
  const batch = req.params.batch;

  try {
    const data = JSON.parse(fs.readFileSync("redirect.json"));
    const botUsername = data.bot_username || data.current_bot;

    if (!botUsername) {
      return res.status(500).send("Bot username not set.");
    }

    return res.redirect(`https://t.me/${botUsername}?start=batch_${batch}`);
  } catch (e) {
    return res.status(500).send("Error reading redirect.json");
  }
});

module.exports = router;
