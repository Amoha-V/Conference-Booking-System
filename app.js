const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.json({ message: 'Ultra minimal app works!' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Ultra minimal server running on port ${PORT}`);
});