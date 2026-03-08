const express = require('express');
const userDataService = require('../userDataService');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { page = 1, pageSize = 20, searchKeyword = '' } = req.query;
    const result = await userDataService.history.getUserHistory(
      req.user.id,
      page,
      pageSize,
      searchKeyword
    );
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const result = await userDataService.history.addHistory(req.user.id, req.body);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const result = await userDataService.history.deleteHistory(req.user.id, req.params.id);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
