import { Route, Routes } from "react-router-dom";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import Home from "./pages/Home";
import Privacy from "./pages/Privacy";
import Support from "./pages/Support";
import Eula from "./pages/Eula";
import Terms from "./pages/Terms";
import Guide from "./pages/Guide";

export default function App() {
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="skip-link">
        Skip to main content
      </a>
      <Navbar />
      {/* tabIndex -1 makes #main a valid focus target for the skip link; the
          sticky navbar is cleared via scroll-margin-top (SC 2.4.11). */}
      <main id="main" tabIndex={-1} className="flex-1 scroll-mt-24">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/guide" element={<Guide />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/support" element={<Support />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/eula" element={<Eula />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}
