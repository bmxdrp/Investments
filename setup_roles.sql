-- Create roles table
CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(50) NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add role_id to users table if it doesn't exist
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'role_id') THEN
        ALTER TABLE users ADD COLUMN role_id UUID REFERENCES roles(id);
    END IF;
END $$;

-- Insert default roles
INSERT INTO roles (name, description)
VALUES 
  ('admin', 'Administrator with full access'),
  ('user', 'Regular user with access to their own portfolio')
ON CONFLICT (name) DO NOTHING;

-- Set default role for existing users (optional, set to 'user' role)
DO $$
DECLARE
  user_role_id UUID;
BEGIN
  SELECT id INTO user_role_id FROM roles WHERE name = 'user';
  
  IF user_role_id IS NOT NULL THEN
    UPDATE users SET role_id = user_role_id WHERE role_id IS NULL;
  END IF;
END $$;
