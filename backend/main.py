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
    isin: str
    ticker: Optional[str] = None
    date_of_exit: Optional[str] = None

@app.get("/api/holdings")
def get_holdings():
    return portfolio_service.get_holdings()

@app.post("/api/settings")
def update_settings(request: UpdateSettingsRequest):
    return portfolio_service.update_holding_settings(
        request.isin, 
        request.ticker, 
        request.date_of_exit
    )

@app.post("/api/discover")
def auto_discover():
    result = portfolio_service.auto_discover_all()
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
