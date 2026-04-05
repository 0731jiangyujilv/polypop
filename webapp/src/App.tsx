import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { config } from '@/config/wagmi'
import { HomePage } from '@/pages/HomePage'
import { CreateBetPage } from '@/pages/CreateBetPage'
import { BetPage } from '@/pages/BetPage'
import { StatsPage } from '@/pages/StatsPage'
import { SharePage } from '@/pages/SharePage'
import { CreatePredictionPage } from '@/pages/CreatePredictionPage'
import { MarketPage } from '@/pages/MarketPage'
import { AceClaimPage } from '@/pages/AceClaimPage'
import { SwapPage } from '@/pages/SwapPage'

const queryClient = new QueryClient()

function App() {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/create/:betId" element={<CreateBetPage />} />
            <Route path="/bet/:contractAddress" element={<BetPage />} />
            <Route path="/share/:contractAddress" element={<SharePage />} />
            <Route path="/stats" element={<StatsPage />} />
            <Route path="/create" element={<CreatePredictionPage />} />
            <Route path="/market/:contractAddress" element={<MarketPage />} />
            <Route path="/ace" element={<AceClaimPage />} />
            <Route path="/swap" element={<SwapPage />} />
          </Routes>
        </BrowserRouter>
      </QueryClientProvider>
    </WagmiProvider>
  )
}

export default App
