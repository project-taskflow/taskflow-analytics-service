const authenticate = (req, res, next) => {
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  req.user = { id: userId, email: req.headers['x-user-email'], role: req.headers['x-user-role'] };
  next();
};

module.exports = { authenticate };
