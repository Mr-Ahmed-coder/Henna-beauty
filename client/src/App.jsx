import { Routes, Route, Link } from "react-router-dom";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import Services from "./pages/Services";
import About from "./pages/About";
import Contact from "./pages/Contact";
import QueuePage from "./queue/QueuePage";
import Admin from "./admin/Admin";
import BookingPage from "./booking/BookingPage";
export default function App() {
  return (
    <Routes>
      <Route path="/admin/*" element={<Admin />} />
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="services" element={<Services />} />
        <Route path="about" element={<About />} />
        <Route path="contact" element={<Contact />} />
        <Route path="appointments/*" element={<BookingPage />} />
        <Route path="queue/*" element={<QueuePage />} />
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
