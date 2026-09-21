const supabase = require('../config/supabase');

const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Missing or malformed Bearer token.',
      });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access token not provided.',
      });
    }

    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid, expired, or unauthorized access token.',
        error: error ? error.message : undefined,
      });
    }

    // Attach user to request
    req.user = user;
    req.token = token;
    next();
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Server error verifying authentication token.',
      error: err.message,
    });
  }
};

module.exports = authenticateToken;
