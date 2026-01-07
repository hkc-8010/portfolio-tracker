import React from 'react';
import { QueryClient, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import HoldingsTable from './components/HoldingsTable';
import { getPortfolios, createPortfolio, renamePortfolio } from './lib/api';
import { Layout, Plus, PieChart, ChevronDown, Edit3 } from 'lucide-react';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 1000 * 60 * 60 * 24, // 24 hours
      staleTime: 0,
    },
  },
});

const persister = createSyncStoragePersister({
  storage: window.localStorage,
});

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 text-center text-white">
          <h1 className="text-xl font-bold text-red-400 mb-2">Something went wrong.</h1>
          <pre className="text-sm text-gray-300 bg-gray-900/50 p-4 rounded text-left overflow-auto">
            {this.state.error && this.state.error.toString()}
          </pre>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-all font-bold"
          >
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

function PortfolioManager({ selectedId, onSelect }) {
  const queryClient = useQueryClient();
  const { data: portfolios = [] } = useQuery({
    queryKey: ['portfolios'],
    queryFn: getPortfolios,
  });

  const createMutation = useMutation({
    mutationFn: createPortfolio,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['portfolios'] });
      if (data.success) onSelect(data.portfolio.id);
    },
  });

  const renameMutation = useMutation({
    mutationFn: ({ id, name }) => renamePortfolio(id, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portfolios'] });
    },
  });

  const handleCreate = () => {
    const name = prompt("Enter portfolio name:");
    if (name) createMutation.mutate(name);
  };

  const handleRename = () => {
    const currentPortfolio = portfolios.find(p => p.id === selectedId);
    if (!currentPortfolio) return;

    const newName = prompt("Enter new portfolio name:", currentPortfolio.name);
    if (newName && newName !== currentPortfolio.name) {
      renameMutation.mutate({ id: selectedId, name: newName });
    }
  };

  React.useEffect(() => {
    if (!selectedId && portfolios.length > 0) {
      onSelect(portfolios[0].id);
    }
  }, [portfolios, selectedId, onSelect]);

  return (
    <div className="flex items-center space-x-2">
      <div className="relative group">
        <select
          value={selectedId || ''}
          onChange={(e) => onSelect(e.target.value)}
          className="appearance-none bg-indigo-50 border border-indigo-100/50 text-indigo-700 text-sm font-medium rounded-lg px-4 py-2 pr-10 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer transition-all hover:bg-indigo-100/50"
        >
          {portfolios.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400 pointer-events-none" />
      </div>
      <button
        onClick={handleRename}
        className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors border border-transparent hover:border-indigo-100/50"
        title="Rename Portfolio"
      >
        <Edit3 className="w-5 h-5" />
      </button>
      <button
        onClick={handleCreate}
        className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors border border-transparent hover:border-indigo-100/50"
        title="Create Portfolio"
      >
        <Plus className="w-5 h-5" />
      </button>
    </div>
  );
}

function AppContent() {
  const [selectedPortfolioId, setSelectedPortfolioId] = React.useState(null);

  return (
    <div className="min-h-screen bg-gray-50/50">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-8">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-100">
                <PieChart className="text-white w-6 h-6" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-900 tracking-tight leading-none">Portfolio</h1>
                <span className="text-xs text-indigo-500 font-medium">Auto-Tracker</span>
              </div>
            </div>
            <div className="h-8 w-px bg-gray-100 hidden md:block" />
            <PortfolioManager selectedId={selectedPortfolioId} onSelect={setSelectedPortfolioId} />
          </div>

          <div className="flex items-center space-x-4">
            <div className="hidden sm:flex items-center space-x-2 px-3 py-1.5 bg-green-50 rounded-full border border-green-100/50">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-[10px] font-bold text-green-700 uppercase tracking-wider">Live Updates</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {selectedPortfolioId ? (
          <HoldingsTable portfolioId={selectedPortfolioId} />
        ) : (
          <div className="flex flex-col items-center justify-center py-20 animate-pulse">
            <Layout className="w-16 h-16 text-gray-200 mb-4" />
            <p className="text-gray-400 font-medium">Initializing portfolio...</p>
          </div>
        )}
      </main>
    </div>
  );
}

function App() {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister }}
    >
      <ErrorBoundary>
        <AppContent />
      </ErrorBoundary>
    </PersistQueryClientProvider>
  );
}

export default App;
