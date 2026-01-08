import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getHoldings, updateSettings, autoDiscover, uploadPortfolio, addHolding, deleteHoldingsBulk } from '../lib/api';
import { ArrowUp, ArrowDown, RefreshCw, Wand2, Upload, ExternalLink, Edit2, Save, X, Trash2, PlusCircle, CheckCircle2 } from 'lucide-react';
import clsx from 'clsx';

const HoldingsTable = ({ portfolioId }) => {
    const [lastUpdated, setLastUpdated] = useState(new Date());
    const [selectedIsins, setSelectedIsins] = useState([]);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [newStockForm, setNewStockForm] = useState({ isin: '', stock_name: '', quantity: '', average_buy_price: '', ticker: '' });

    const queryClient = useQueryClient();
    const { data, isLoading, error } = useQuery({
        queryKey: ['holdings', portfolioId],
        queryFn: async () => {
            const res = await getHoldings(portfolioId);
            setLastUpdated(new Date());
            return res;
        },
        refetchInterval: (query) => query.state.data?.is_market_open ? 2000 : 600000,
        refetchIntervalInBackground: true,
        enabled: !!portfolioId
    });

    const holdings = data?.holdings || [];
    const isMarketOpen = data?.is_market_open;

    const updateMutation = useMutation({
        mutationFn: ({ isin, ...settings }) => updateSettings(portfolioId, isin, settings),
        onSuccess: () => {
            queryClient.invalidateQueries(['holdings', portfolioId]);
            setEditingId(null);
        },
    });

    const addStockMutation = useMutation({
        mutationFn: (data) => addHolding({ ...data, portfolio_id: portfolioId }),
        onSuccess: () => {
            queryClient.invalidateQueries(['holdings', portfolioId]);
            setIsAddModalOpen(false);
            setNewStockForm({ isin: '', stock_name: '', quantity: '', average_buy_price: '', ticker: '' });
        },
        onError: (err) => alert("Failed to add stock: " + (err.response?.data?.error || err.message))
    });

    const deleteBulkMutation = useMutation({
        mutationFn: () => deleteHoldingsBulk(portfolioId, selectedIsins),
        onSuccess: () => {
            queryClient.invalidateQueries(['holdings', portfolioId]);
            setSelectedIsins([]);
        },
        onError: (err) => alert("Delete failed: " + err.message)
    });

    const discoverMutation = useMutation({
        mutationFn: autoDiscover,
        onSuccess: (data) => {
            alert(`Auto-discovery completed! Updated ${data.updated} tickers.`);
            queryClient.invalidateQueries(['holdings', portfolioId]);
        }
    });

    const uploadMutation = useMutation({
        mutationFn: uploadPortfolio,
        onSuccess: () => {
            alert('Portfolio updated successfully!');
            queryClient.invalidateQueries(['holdings', portfolioId]);
        },
        onError: (error) => {
            alert(`Upload failed: ${error.response?.data?.detail || error.message}`);
        }
    });

    const fileInputRef = useRef(null);
    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            uploadMutation.mutate(file);
        }
        e.target.value = '';
    };

    const [editingId, setEditingId] = useState(null);
    const [editForm, setEditForm] = useState({ ticker: '', dateOfExit: '', target: '', stopLoss: '', quantity: '', avgPrice: '' });
    const [sortConfig, setSortConfig] = useState({ key: 'total_return_percent', direction: 'desc' });

    // Selection
    const toggleSelect = (isin) => {
        setSelectedIsins(prev =>
            prev.includes(isin) ? prev.filter(i => i !== isin) : [...prev, isin]
        );
    };

    const toggleSelectAll = () => {
        if (selectedIsins.length === holdings?.length) {
            setSelectedIsins([]);
        } else {
            setSelectedIsins(holdings?.map(h => h.isin) || []);
        }
    };

    // Sorting
    const sortedHoldings = React.useMemo(() => {
        if (!holdings) return [];
        let sortableItems = [...holdings];
        if (sortConfig.key !== null) {
            sortableItems.sort((a, b) => {
                let aValue = a[sortConfig.key];
                let bValue = b[sortConfig.key];

                if (sortConfig.key === 'current_value') {
                    aValue = (a.current_price || 0) * a.quantity;
                    bValue = (b.current_price || 0) * b.quantity;
                }

                if (aValue === null || aValue === undefined) aValue = -Infinity;
                if (bValue === null || bValue === undefined) bValue = -Infinity;

                if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return sortableItems;
    }, [holdings, sortConfig]);

    const requestSort = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const SortIcon = ({ columnKey }) => {
        if (sortConfig.key !== columnKey) return <ArrowUp className="w-3 h-3 text-gray-300 ml-1 inline" />;
        return sortConfig.direction === 'asc'
            ? <ArrowUp className="w-3 h-3 text-indigo-600 ml-1 inline" />
            : <ArrowDown className="w-3 h-3 text-indigo-600 ml-1 inline" />;
    };

    if (isLoading) return <div className="p-8 text-center text-gray-500 animate-pulse bg-white rounded-xl border border-gray-100 shadow-sm">Loading portfolio data...</div>;
    if (error) return <div className="p-8 text-center text-red-500 bg-red-50 rounded-xl border border-red-100">Error loading data: {error.message}</div>;

    const handleEdit = (holding) => {
        setEditingId(holding.isin);
        setEditForm({
            ticker: holding.ticker || '',
            dateOfExit: holding.date_of_exit || '',
            target: holding.target || '',
            stopLoss: holding.stop_loss || '',
            quantity: holding.quantity || '',
            avgPrice: holding.average_buy_price || '',
        });
    };

    const handleSave = () => {
        updateMutation.mutate({
            isin: editingId,
            ticker: editForm.ticker,
            date_of_exit: editForm.dateOfExit,
            target: editForm.target ? parseFloat(editForm.target) : null,
            stop_loss: editForm.stopLoss ? parseFloat(editForm.stopLoss) : null,
            quantity: editForm.quantity ? parseInt(editForm.quantity) : null,
            average_buy_price: editForm.avgPrice ? parseFloat(editForm.avgPrice) : null,
        });
    };

    const handleAddSubmit = (e) => {
        e.preventDefault();
        addStockMutation.mutate({
            ...newStockForm,
            quantity: parseInt(newStockForm.quantity),
            average_buy_price: parseFloat(newStockForm.average_buy_price)
        });
    };

    // Calculations
    const totalValue = (holdings || []).reduce((sum, h) => sum + (h.current_price ? h.current_price * h.quantity : 0), 0);
    const totalInvestment = (holdings || []).reduce((sum, h) => sum + (h.average_buy_price ? h.average_buy_price * h.quantity : 0), 0);
    const totalReturnAmount = totalValue - totalInvestment;
    const totalReturnPercent = totalInvestment > 0 ? (totalReturnAmount / totalInvestment) * 100 : 0;

    const totalDayChangeAmount = (holdings || []).reduce((sum, h) => sum + (h.day_change_amount ? h.day_change_amount * h.quantity : 0), 0);
    const prevDayTotalValue = totalValue - totalDayChangeAmount;
    const totalDayChangePercent = prevDayTotalValue > 0 ? (totalDayChangeAmount / prevDayTotalValue) * 100 : 0;

    const totalStocks = (holdings || []).length;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                <div className="flex flex-col items-start">
                    <h2 className="text-lg font-bold text-gray-900 flex items-center">
                        Holdings
                        <span className="ml-2 px-2 py-0.5 bg-gray-100 rounded text-xs font-mono text-gray-500">{totalStocks} items</span>
                    </h2>
                    <div className="flex items-center space-x-2 mt-0.5">
                        <p className="text-[10px] text-gray-400 font-mono flex items-center">
                            <RefreshCw className="w-2.5 h-2.5 mr-1" />
                            SYNCED: {lastUpdated.toLocaleTimeString()}
                        </p>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center uppercase tracking-tighter">
                            {isMarketOpen ? (
                                <span className="bg-green-100 text-green-700 flex items-center px-1.5 rounded">
                                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse mr-1" />
                                    Live
                                </span>
                            ) : (
                                <span className="bg-gray-100 text-gray-500 px-1.5 rounded">Closed</span>
                            )}
                        </span>
                    </div>
                </div>
                <div className="flex items-center space-x-2">
                    <button
                        onClick={() => setIsAddModalOpen(true)}
                        className="flex items-center space-x-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold px-4 py-2 rounded-lg text-sm transition-all border border-indigo-100/50"
                    >
                        <PlusCircle className="w-4 h-4" />
                        <span>Add Stock</span>
                    </button>
                    <div className="w-px h-6 bg-gray-100 mx-1" />
                    <button
                        onClick={() => discoverMutation.mutate()}
                        disabled={discoverMutation.isPending}
                        className="flex items-center space-x-2 text-indigo-600 hover:bg-gray-50 px-3 py-2 rounded-lg text-sm transition-all"
                    >
                        {discoverMutation.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                        <span className="hidden sm:inline">Auto-Discover</span>
                    </button>
                    <div>
                        <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".xlsx,.xls" />
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploadMutation.isPending}
                            className="flex items-center space-x-2 text-gray-600 hover:bg-gray-50 px-3 py-2 rounded-lg text-sm transition-all"
                        >
                            {uploadMutation.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                            <span className="hidden sm:inline">Bulk Import</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Portfolio Value</p>
                    <p className="text-xl font-black text-gray-900">₹{totalValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
                </div>
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Investment</p>
                    <p className="text-xl font-black text-gray-900">₹{totalInvestment.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
                </div>
                <div className={clsx(
                    "p-4 rounded-xl shadow-lg col-span-1 text-white transition-all transform hover:scale-[1.02]",
                    totalReturnAmount >= 0 ? "bg-green-600 shadow-green-100" : "bg-red-600 shadow-red-100"
                )}>
                    <p className="text-[10px] font-bold text-white/80 uppercase tracking-wider mb-2">PnL Total</p>
                    <div className="flex items-end justify-between">
                        <p className="text-xl font-black">
                            {totalReturnAmount < 0 ? '-' : ''}₹{Math.abs(totalReturnAmount).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                        </p>
                        <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-white/20">
                            {totalReturnPercent.toFixed(1)}%
                        </span>
                    </div>
                </div>
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">1-Day Change</p>
                    <div className={clsx("flex items-center", totalDayChangeAmount >= 0 ? "text-green-600" : "text-red-600")}>
                        <p className="text-xl font-black">
                            {totalDayChangeAmount < 0 ? '-' : ''}₹{Math.abs(totalDayChangeAmount).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                        </p>
                        <span className="text-xs font-bold ml-2">({totalDayChangePercent.toFixed(1)}%)</span>
                    </div>
                </div>
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 hidden lg:block">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Diversification</p>
                    <p className="text-xl font-black text-gray-900">{totalStocks} Stocks</p>
                </div>
            </div>

            {/* Selection Bar */}
            {selectedIsins.length > 0 && (
                <div className="bg-indigo-900 text-white px-6 py-3 rounded-xl shadow-xl flex items-center justify-between sticky top-20 z-20 animate-in slide-in-from-top-4 duration-300">
                    <div className="flex items-center space-x-3">
                        <CheckCircle2 className="w-5 h-5 text-indigo-400" />
                        <span className="font-bold">{selectedIsins.length} stocks selected</span>
                    </div>
                    <div className="flex items-center space-x-4">
                        <button
                            onClick={deleteBulkMutation.mutate}
                            disabled={deleteBulkMutation.isPending}
                            className="flex items-center space-x-2 bg-red-500 hover:bg-red-600 px-4 py-1.5 rounded-lg text-sm font-bold transition-all"
                        >
                            <Trash2 className="w-4 h-4" />
                            <span>Delete Selected</span>
                        </button>
                        <button onClick={() => setSelectedIsins([])} className="text-indigo-300 hover:text-white text-sm font-medium">Cancel</button>
                    </div>
                </div>
            )}

            {/* Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm border-collapse">
                        <thead className="bg-gray-50/50 text-gray-500 border-b border-gray-100">
                            <tr>
                                <th className="p-4 w-10">
                                    <input
                                        type="checkbox"
                                        checked={selectedIsins.length === (holdings?.length || 0) && holdings?.length > 0}
                                        onChange={toggleSelectAll}
                                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-gray-300"
                                    />
                                </th>
                                <th className="p-4 font-bold uppercase tracking-wider text-[10px] cursor-pointer hover:bg-gray-100/50" onClick={() => requestSort('stock_name')}>Stock Detail <SortIcon columnKey="stock_name" /></th>
                                <th className="p-4 font-bold uppercase tracking-wider text-[10px] text-right cursor-pointer hover:bg-gray-100/50" onClick={() => requestSort('quantity')}>Qty <SortIcon columnKey="quantity" /></th>
                                <th className="p-4 font-bold uppercase tracking-wider text-[10px] text-right cursor-pointer hover:bg-gray-100/50" onClick={() => requestSort('average_buy_price')}>Price <SortIcon columnKey="average_buy_price" /></th>
                                <th className="p-4 font-bold uppercase tracking-wider text-[10px] text-right cursor-pointer hover:bg-gray-100/50" onClick={() => requestSort('current_price')}>LTP <SortIcon columnKey="current_price" /></th>
                                <th className="p-4 font-bold uppercase tracking-wider text-[10px] text-right cursor-pointer hover:bg-gray-100/50" onClick={() => requestSort('day_change_percent')}>Day Change <SortIcon columnKey="day_change_percent" /></th>
                                <th className="p-4 font-bold uppercase tracking-wider text-[10px] text-right cursor-pointer hover:bg-gray-100/50" onClick={() => requestSort('total_return_percent')}>Return <SortIcon columnKey="total_return_percent" /></th>
                                <th className="p-4 font-bold uppercase tracking-wider text-[10px] text-right cursor-pointer hover:bg-gray-100/50" onClick={() => requestSort('current_value')}>Current Value <SortIcon columnKey="current_value" /></th>

                                {/* Fundamental Columns */}
                                <th className="p-4 font-bold uppercase tracking-wider text-[10px] text-right bg-indigo-50/20 cursor-pointer hover:bg-indigo-100/30" onClick={() => requestSort('pe_ratio')}>P/E <SortIcon columnKey="pe_ratio" /></th>
                                <th className="p-4 font-bold uppercase tracking-wider text-[10px] text-right bg-indigo-50/20 cursor-pointer hover:bg-indigo-100/30" onClick={() => requestSort('peg_ratio')}>PEG <SortIcon columnKey="peg_ratio" /></th>
                                <th className="p-4 font-bold uppercase tracking-wider text-[10px] text-right bg-indigo-50/20 cursor-pointer hover:bg-indigo-100/30" onClick={() => requestSort('debt_to_equity')}>D/E <SortIcon columnKey="debt_to_equity" /></th>
                                <th className="p-4 font-bold uppercase tracking-wider text-[10px] text-right bg-indigo-50/20 cursor-pointer hover:bg-indigo-100/30" onClick={() => requestSort('market_cap')}>Mkt Cap <SortIcon columnKey="market_cap" /></th>
                                <th className="p-4 font-bold uppercase tracking-wider text-[10px] text-right bg-green-50/20 cursor-pointer hover:bg-green-100/30" onClick={() => requestSort('sales_growth_3y')}>Sales G. <SortIcon columnKey="sales_growth_3y" /></th>
                                <th className="p-4 font-bold uppercase tracking-wider text-[10px] text-right bg-green-50/20 cursor-pointer hover:bg-green-100/30" onClick={() => requestSort('eps_growth_3y')}>EPS G. <SortIcon columnKey="eps_growth_3y" /></th>

                                <th className="p-4 font-bold uppercase tracking-wider text-[10px] text-right cursor-pointer hover:bg-gray-100/50" onClick={() => requestSort('stop_loss')}>SL <SortIcon columnKey="stop_loss" /></th>
                                <th className="p-4 font-bold uppercase tracking-wider text-[10px] text-right cursor-pointer hover:bg-gray-100/50" onClick={() => requestSort('target')}>Target <SortIcon columnKey="target" /></th>
                                <th className="p-4 font-bold uppercase tracking-wider text-[10px] text-center cursor-pointer hover:bg-gray-100/50" onClick={() => requestSort('state')}>State <SortIcon columnKey="state" /></th>
                                <th className="p-4 font-bold uppercase tracking-wider text-[10px] cursor-pointer hover:bg-gray-100/50" onClick={() => requestSort('date_of_exit')}>Exit date <SortIcon columnKey="date_of_exit" /></th>
                                <th className="p-4 w-12 text-center text-xs font-bold text-gray-300">#</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {sortedHoldings.map((holding) => (
                                <tr key={holding.isin} className={clsx(
                                    "transition-all duration-200 group",
                                    selectedIsins.includes(holding.isin) ? "bg-indigo-50/50" : "hover:bg-gray-50/30",
                                    holding.total_return_percent >= 30 ? "bg-green-50/50" : ""
                                )}>
                                    <td className="p-4">
                                        <input
                                            type="checkbox"
                                            checked={selectedIsins.includes(holding.isin)}
                                            onChange={() => toggleSelect(holding.isin)}
                                            className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-gray-300"
                                        />
                                    </td>
                                    <td className="p-4 font-bold text-gray-900">
                                        <div className="flex flex-col">
                                            <span>{holding.stock_name}</span>
                                            <span className="text-[10px] text-gray-400 font-mono font-medium">{holding.isin}</span>
                                            <div className="flex items-center space-x-2 mt-1 translate-y-1 opacity-0 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300">
                                                {holding.ticker ? (
                                                    <a href={`https://finance.yahoo.com/quote/${holding.ticker}`} target="_blank" rel="noopener noreferrer" className="text-[10px] font-bold text-indigo-500 hover:text-indigo-700 flex items-center bg-indigo-50 px-1.5 py-0.5 rounded">
                                                        {holding.ticker} <ExternalLink className="w-2.5 h-2.5 ml-1" />
                                                    </a>
                                                ) : (
                                                    <span className="text-[10px] text-gray-300 italic">No ticker</span>
                                                )}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="p-4 text-right">
                                        {editingId === holding.isin ? (
                                            <input type="number" value={editForm.quantity} onChange={e => setEditForm({ ...editForm, quantity: e.target.value })} className="w-16 p-1 border rounded text-right text-xs" />
                                        ) : (
                                            <span className="font-semibold text-gray-700">{holding.quantity}</span>
                                        )}
                                    </td>
                                    <td className="p-4 text-right">
                                        {editingId === holding.isin ? (
                                            <input type="number" value={editForm.avgPrice} onChange={e => setEditForm({ ...editForm, avgPrice: e.target.value })} className="w-20 p-1 border rounded text-right text-xs" />
                                        ) : (
                                            <span className="text-gray-500">₹{holding.average_buy_price?.toLocaleString('en-IN')}</span>
                                        )}
                                    </td>
                                    <td className="p-4 text-right font-bold text-gray-900 tracking-tight">
                                        {holding.current_price ? `₹${holding.current_price.toLocaleString('en-IN')}` : '-'}
                                    </td>
                                    <td className={clsx("p-4 text-right font-bold", holding.day_change_percent > 0 ? "text-green-600" : holding.day_change_percent < 0 ? "text-red-600" : "text-gray-400")}>
                                        {holding.day_change_percent ? (
                                            <div className="flex flex-col items-end">
                                                <span>{holding.day_change_percent.toFixed(2)}%</span>
                                                <span className="text-[10px] font-medium opacity-80">({holding.day_change_amount * holding.quantity >= 0 ? '+' : '-'}₹{Math.abs(Math.round(holding.day_change_amount * holding.quantity)).toLocaleString('en-IN')})</span>
                                            </div>
                                        ) : '-'}
                                    </td>
                                    <td className={clsx("p-4 text-right font-black", holding.total_return_percent > 0 ? "text-green-600" : holding.total_return_percent < 0 ? "text-red-500" : "text-gray-400")}>
                                        {holding.total_return_percent ? (
                                            <div className="flex flex-col items-end">
                                                <span>{holding.total_return_percent.toFixed(1)}%</span>
                                                <span className="text-[10px] font-medium opacity-80">({(holding.current_price - holding.average_buy_price) * holding.quantity >= 0 ? '+' : '-'}₹{Math.abs(Math.round((holding.current_price - holding.average_buy_price) * holding.quantity)).toLocaleString('en-IN')})</span>
                                            </div>
                                        ) : '-'}
                                    </td>
                                    <td className="p-4 text-right whitespace-nowrap">
                                        {holding.current_price ? (
                                            <div className="flex flex-col items-end">
                                                <span className="font-bold text-gray-900">₹{((holding.current_price * holding.quantity)).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                                                <span className="text-[10px] text-gray-400 font-medium">(₹{(holding.average_buy_price * holding.quantity).toLocaleString('en-IN', { maximumFractionDigits: 0 })})</span>
                                            </div>
                                        ) : '-'}
                                    </td>

                                    {/* Fundamental Cells */}
                                    <td className="p-4 text-right font-medium text-gray-500 bg-indigo-50/5">{holding.pe_ratio ? holding.pe_ratio.toFixed(1) : '-'}</td>
                                    <td className="p-4 text-right font-medium text-gray-500 bg-indigo-50/5">{holding.peg_ratio ? holding.peg_ratio.toFixed(2) : '-'}</td>
                                    <td className="p-4 text-right font-medium text-gray-500 bg-indigo-50/5">{holding.debt_to_equity ? holding.debt_to_equity.toFixed(2) : '-'}</td>
                                    <td className="p-4 text-right font-medium text-gray-500 bg-indigo-50/5 whitespace-nowrap">{holding.market_cap ? `₹${(holding.market_cap / 1e7).toFixed(0)} Cr` : '-'}</td>
                                    <td className={clsx("p-4 text-right font-bold bg-green-50/5", (holding.sales_growth_3y || 0) > 15 ? "text-green-600" : "text-gray-400")}>{holding.sales_growth_3y ? `${holding.sales_growth_3y.toFixed(1)}%` : '-'}</td>
                                    <td className={clsx("p-4 text-right font-bold bg-green-50/5", (holding.eps_growth_3y || 0) > 15 ? "text-green-600" : "text-gray-400")}>{holding.eps_growth_3y ? `${holding.eps_growth_3y.toFixed(1)}%` : '-'}</td>

                                    <td className="p-4 text-right">
                                        {editingId === holding.isin ? (
                                            <input type="number" value={editForm.stopLoss} onChange={e => setEditForm({ ...editForm, stopLoss: e.target.value })} placeholder="SL" className="w-20 text-xs p-1 border rounded text-right" />
                                        ) : (
                                            <span className="text-pink-600/70 font-bold">{holding.stop_loss ? `₹${holding.stop_loss}` : '-'}</span>
                                        )}
                                    </td>
                                    <td className="p-4 text-right">
                                        {editingId === holding.isin ? (
                                            <input type="number" value={editForm.target} onChange={e => setEditForm({ ...editForm, target: e.target.value })} placeholder="Target" className="w-20 text-xs p-1 border rounded text-right" />
                                        ) : (
                                            <span className="text-teal-600/70 font-bold">{holding.target ? `₹${holding.target}` : '-'}</span>
                                        )}
                                    </td>
                                    <td className="p-4 text-center">
                                        <span className={clsx("px-2 py-0.5 rounded text-[10px] font-black tracking-tight uppercase",
                                            holding.state === "SELL" ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-500"
                                        )}>
                                            {holding.state}
                                        </span>
                                        {holding.state_reason && <div className="text-[10px] text-gray-400 mt-1 font-medium">{holding.state_reason}</div>}
                                    </td>
                                    <td className="p-4">
                                        {editingId === holding.isin ? (
                                            <input type="date" value={editForm.dateOfExit} onChange={e => setEditForm({ ...editForm, dateOfExit: e.target.value })} className="border rounded px-2 py-1 text-xs w-full" />
                                        ) : (
                                            <span className="text-gray-400 text-xs font-medium tracking-tight uppercase">{holding.date_of_exit || '-'}</span>
                                        )}
                                    </td>
                                    <td className="p-4 text-right">
                                        {editingId === holding.isin ? (
                                            <div className="flex space-x-1 justify-end">
                                                <button onClick={handleSave} className="p-1 text-green-600 hover:bg-green-50 rounded"><Save className="w-4 h-4" /></button>
                                                <button onClick={() => setEditingId(null)} className="p-1 text-red-600 hover:bg-red-50 rounded"><X className="w-4 h-4" /></button>
                                            </div>
                                        ) : (
                                            <button onClick={() => handleEdit(holding)} className="p-1 text-gray-300 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-all"><Edit2 className="w-4 h-4" /></button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Add Stock Modal */}
            {isAddModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="bg-indigo-600 p-6 text-white flex justify-between items-center">
                            <h3 className="text-xl font-bold flex items-center"><PlusCircle className="mr-2" /> Add New Stock</h3>
                            <button onClick={() => setIsAddModalOpen(false)} className="hover:rotate-90 transition-transform"><X /></button>
                        </div>
                        <form onSubmit={handleAddSubmit} className="p-8 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="col-span-2">
                                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Stock Name</label>
                                    <input required type="text" value={newStockForm.stock_name} onChange={e => setNewStockForm({ ...newStockForm, stock_name: e.target.value })} className="w-full p-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 font-medium" placeholder="e.g. Reliance Industries" />
                                </div>
                                <div className="col-span-2">
                                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">ISIN (Required for lookup)</label>
                                    <input required type="text" value={newStockForm.isin} onChange={e => setNewStockForm({ ...newStockForm, isin: e.target.value })} className="w-full p-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 font-mono text-sm" placeholder="INE..." />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Quantity</label>
                                    <input required type="number" value={newStockForm.quantity} onChange={e => setNewStockForm({ ...newStockForm, quantity: e.target.value })} className="w-full p-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 font-medium" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Avg Buy Price</label>
                                    <input required type="number" step="0.01" value={newStockForm.average_buy_price} onChange={e => setNewStockForm({ ...newStockForm, average_buy_price: e.target.value })} className="w-full p-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 font-medium" />
                                </div>
                                <div className="col-span-2">
                                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Ticker (Optional)</label>
                                    <input type="text" value={newStockForm.ticker} onChange={e => setNewStockForm({ ...newStockForm, ticker: e.target.value })} className="w-full p-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 font-medium" placeholder="RELIANCE.NS" />
                                </div>
                            </div>
                            <button type="submit" disabled={addStockMutation.isPending} className="w-full mt-4 bg-indigo-600 text-white font-bold py-4 rounded-xl shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all flex items-center justify-center space-x-2">
                                {addStockMutation.isPending ? <RefreshCw className="animate-spin" /> : <><Save /> <span>Add to Portfolio</span></>}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default HoldingsTable;
