-- Create holdings table
CREATE TABLE IF NOT EXISTS holdings (
    isin TEXT PRIMARY KEY,
    stock_name TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    average_buy_price NUMERIC NOT NULL,
    ticker TEXT,
    date_of_exit TEXT,
    target NUMERIC,
    stop_loss NUMERIC,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on stock_name for faster searches
CREATE INDEX IF NOT EXISTS idx_holdings_stock_name ON holdings(stock_name);

-- Enable Row Level Security (RLS)
ALTER TABLE holdings ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all operations (you can restrict this later)
CREATE POLICY "Enable all access for authenticated users" ON holdings
    FOR ALL
    USING (true)
    WITH CHECK (true);
