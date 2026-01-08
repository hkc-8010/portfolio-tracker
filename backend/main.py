from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
from portfolio_service import portfolio_service

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # For dev only
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class UpdateSettingsRequest(BaseModel):
    portfolio_id: str
    isin: str
    ticker: Optional[str] = None
    date_of_exit: Optional[str] = None
    target: Optional[float] = None
    stop_loss: Optional[float] = None
    quantity: Optional[int] = None
    avg_price: Optional[float] = None

class AddHoldingRequest(BaseModel):
    portfolio_id: str
    isin: str
    stock_name: str
    quantity: int
    average_buy_price: float
    ticker: Optional[str] = None

class DeleteHoldingsRequest(BaseModel):
    portfolio_id: str
    isins: List[str]

class CreatePortfolioRequest(BaseModel):
    name: str

class UpdatePortfolioRequest(BaseModel):
    name: str

@app.get("/api/portfolios")
def get_portfolios():
    return portfolio_service.get_portfolios()

@app.post("/api/portfolios")
def create_portfolio(request: CreatePortfolioRequest):
    return portfolio_service.create_portfolio(request.name)

@app.put("/api/portfolios/{id}")
def rename_portfolio(id: str, request: UpdatePortfolioRequest):
    return portfolio_service.rename_portfolio(id, request.name)

@app.delete("/api/portfolios/{id}")
def delete_portfolio(id: str):
    return portfolio_service.delete_portfolio(id)

@app.get("/api/holdings")
def get_holdings(portfolio_id: str):
    return portfolio_service.get_holdings(portfolio_id)

@app.post("/api/holdings/add")
def add_holding(request: AddHoldingRequest):
    return portfolio_service.add_holding(request.dict())

@app.post("/api/holdings/delete-bulk")
def delete_holdings(request: DeleteHoldingsRequest):
    return portfolio_service.delete_holdings(request.portfolio_id, request.isins)

@app.post("/api/settings")
def update_settings(request: UpdateSettingsRequest):
    return portfolio_service.update_holding_settings(
        request.portfolio_id,
        request.isin, 
        request.ticker, 
        request.date_of_exit,
        request.target,
        request.stop_loss,
        request.quantity,
        request.avg_price
    )

@app.post("/api/discover")
def auto_discover(portfolio_id: Optional[str] = None):
    result = portfolio_service.auto_discover_all(portfolio_id)
    return result

@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    if not file.filename.endswith('.xlsx') and not file.filename.endswith('.xls'):
        raise HTTPException(status_code=400, detail="Invalid file format. Please upload an Excel file.")
    
    content = await file.read()
    portfolio_service.save_excel_file(content)
    return {"message": "Portfolio updated successfully"}

@app.get("/health")
def health_check():
    return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
