const jwt = require('jsonwebtoken');

module.exports = function authenticateUser(req, res, next) {
    const token = req.header('Authorization')?.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'No token, authorization denied.' });
    }

    try {
        req.user = jwt.verify(token, process.env.JWT_SECRET); // { id, role }
        next();
    } catch (err) {
        res.status(401).json({ error: 'Token is not valid.' });
    }
};
