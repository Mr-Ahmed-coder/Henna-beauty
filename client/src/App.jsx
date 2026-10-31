import { Routes, Route, Link } from "react-router-dom";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import Services from "./pages/Services";
import About from "./pages/About";
import Contact from "./pages/Contact";
import ComingSoon from "./pages/ComingSoon";
export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="services" element={<Services />} />
        <Route path="about" element={<About />} />
        <Route path="contact" element={<Contact />} />
        <Route path="appointments" element={<ComingSoon />} />
        <Route path="queue" element={<ComingSoon queue />} />
        <Route
          path="*"
          element={
            <section className="coming-soon container">
              <p className="eyebrow">404 · PAGE NOT FOUND</p>
              <h1>A little off the path.</h1>
              <Link className="button" to="/">
                Back to home
              </Link>
            </section>
          }
        />
      </Route>
    </Routes>
  );
}
