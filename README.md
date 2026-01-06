# Portfolio Tracker

A comprehensive Stock Portfolio Tracker application that allows users to monitor their investments, track live prices, and discover stock tickers for their holdings.

## 🚀 Features

- **Portfolio Monitoring**: View all your holdings with real-time price updates.
- **Auto-Discovery**: Automatically find stock tickers for holdings using ISIN or company names.
- **Excel Upload**: Bulk update your portfolio by uploading Excel files.
- **Custom Settings**: Edit tickers and exit dates for individual holdings.
- **Real-time Data**: Integration with `yfinance` for live market data.
- **Secure Backend**: Powered by FastAPI and Supabase.

## 🛠️ Tech Stack

### Frontend
- **React (Vite)**
- **Tailwind CSS**
- **TanStack Query (React Query)**
- **Axios**
- **Lucide React (Icons)**

### Backend
- **FastAPI**
- **Supabase (PostgreSQL)**
- **yfinance** (Stock data)
- **Pandas** (Excel processing)

## 📦 Project Structure

```text
portfolio-tracker/
├── frontend/          # React + Vite application
├── backend/           # FastAPI application
├── run_app.sh         # Convenience script to run both
└── supabase_schema.sql # Database schema
```

## 🛠️ Setup & Installation

### Prerequisites
- Node.js & npm
- Python 3.10+
- Supabase account and credentials

### Backend Setup
1. Navigate to the `backend` directory:
   ```bash
   cd backend
   ```
2. Create and activate a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```
3. Install dependencies:
   ```bash
   pip install fastapi uvicorn yfinance supabase pandas openpyxl
   ```
4. Set up your Supabase environment variables in `portfolio_service.py` (or use a `.env` file).

### Frontend Setup
1. Navigate to the `frontend` directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```

### Running the App
You can use the provided script to start both backend and frontend:
```bash
./run_app.sh
```

## 📄 License
MIT License
