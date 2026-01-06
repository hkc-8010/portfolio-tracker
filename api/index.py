from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List

try:
    from portfolio_service import portfolio_service
except ImportError:
    try:
        from api.portfolio_service import portfolio_service
    except ImportError as e:
        portfolio_service = None
        import_error = str(e)
    else:
        import_error = None
else:
    import_error = None

app = FastAPI()

@app.exception_handler(Exception)
async def debug_exception_handler(request, exc):
    import traceback
    return {
        "error": str(exc),
        "traceback": traceback.format_exc(),
        "import_error": import_error
    }, 500

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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
    if portfolio_service is None:
        raise HTTPException(status_code=500, detail=f"Portfolio service not initialized. Import error: {import_error}")
    return portfolio_service.get_holdings()

@app.post("/api/settings")
def update_settings(request: UpdateSettingsRequest):
    if portfolio_service is None:
        raise HTTPException(status_code=500, detail="Portfolio service not initialized")
    return portfolio_service.update_holding_settings(
        request.isin, 
        request.ticker, 
        request.date_of_exit
    )

@app.post("/api/discover")
def auto_discover():
    if portfolio_service is None:
        raise HTTPException(status_code=500, detail="Portfolio service not initialized")
    result = portfolio_service.auto_discover_all()
    return result

@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    if portfolio_service is None:
        raise HTTPException(status_code=500, detail="Portfolio service not initialized")
    if not file.filename.endswith('.xlsx') and not file.filename.endswith('.xls'):
        raise HTTPException(status_code=400, detail="Invalid file format. Please upload an Excel file.")
    
    content = await file.read()
    portfolio_service.save_excel_file(content)
    return {"message": "Portfolio updated successfully"}

@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "service_initialized": portfolio_service is not None,
        "import_error": import_error
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
