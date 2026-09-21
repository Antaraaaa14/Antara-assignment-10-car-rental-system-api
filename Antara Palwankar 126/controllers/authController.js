const supabase = require('../config/supabase');

// @desc    Register a new customer/user with Supabase Auth
// @route   POST /api/auth/register
// @access  Public
exports.register = async (req, res, next) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide both email and password.',
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long.',
      });
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name: name || email.split('@')[0],
        },
      },
    });

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    res.status(201).json({
      success: true,
      message: 'User registered successfully with Supabase.',
      data: {
        user: {
          id: data.user?.id,
          email: data.user?.email,
          name: data.user?.user_metadata?.name,
          createdAt: data.user?.created_at,
        },
        session: data.session,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Login customer and receive Supabase access token
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password.',
      });
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return res.status(401).json({
        success: false,
        message: error.message || 'Invalid email or password.',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Logged in successfully.',
      data: {
        access_token: data.session?.access_token,
        token_type: data.session?.token_type || 'Bearer',
        expires_in: data.session?.expires_in,
        user: {
          id: data.user?.id,
          email: data.user?.email,
          name: data.user?.user_metadata?.name,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get currently authenticated user profile
// @route   GET /api/auth/profile
// @access  Private
exports.getProfile = async (req, res, next) => {
  try {
    res.status(200).json({
      success: true,
      message: 'User profile retrieved successfully.',
      data: {
        id: req.user.id,
        email: req.user.email,
        name: req.user.user_metadata?.name || '',
        createdAt: req.user.created_at,
        lastSignInAt: req.user.last_sign_in_at,
      },
    });
  } catch (error) {
    next(error);
  }
};
