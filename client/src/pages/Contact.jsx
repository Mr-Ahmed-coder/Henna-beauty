import { Link } from "react-router-dom";
import { PageHeading } from "../components/Shared";

export default function Contact() {
  return (
    <>
      <PageHeading title="Contact & Location">
        Visit Amallina Beauty Salon in Minneapolis or reach out directly to our team.
      </PageHeading>
      <section className="contact-grid container">
        <div className="contact-details">
          <article>
            <div>
              <h3>Salon Address</h3>
              <p>2910 Pillsbury Ave #263<br />Minneapolis, MN 55408</p>
            </div>
          </article>
          <article>
            <div>
              <h3>Phone</h3>
              <p>
                <a href="tel:+16128004944">+1 (612) 800-4944</a>
              </p>
            </div>
          </article>
          <article>
            <div>
              <h3>Email</h3>
              <p>
                <a href="mailto:qurux21b@gmail.com">qurux21b@gmail.com</a>
              </p>
            </div>
          </article>
          <article>
            <div>
              <h3>Appointments</h3>
              <p>Book online to reserve a time with your artist.</p>
            </div>
          </article>
        </div>
        <aside className="contact-aside">
          <h2>Plan your visit</h2>
          <p>Book ahead to reserve a dedicated time with your artist.</p>
          <div className="actions">
            <Link className="button" to="/appointments">Book Appointment</Link>
          </div>
        </aside>
      </section>
    </>
  );
}
