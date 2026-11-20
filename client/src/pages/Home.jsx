import { Link } from "react-router-dom";

export default function Home() {
  return (
    <section className="home-booking container">
      <h1>Beauty &amp; Henna Care</h1>
      <Link className="button home-booking-button" to="/appointments">
        Book Appointment
      </Link>
    </section>
  );
}
