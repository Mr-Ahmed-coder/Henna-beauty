import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeading } from "../components/Shared";

export default function TrackVisit() {
  const [link, setLink] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();
  function submit(event) {
    event.preventDefault();
    try {
      const url = new URL(link, window.location.origin);
      const allowed = ["/appointments/manage", "/queue/ticket"].includes(
        url.pathname,
      );
      const params = new URLSearchParams(url.hash.slice(1));
      if (
        url.origin !== window.location.origin ||
        !allowed ||
        !params.get("reference") ||
        !params.get("token")
      )
        throw new Error();
      navigate(url.pathname + url.hash);
    } catch {
      setError("Paste the complete private link from your appointment confirmation.");
    }
  }
  return (
    <>
      <PageHeading title="My Booking">
        Paste your private link to open your appointment.
      </PageHeading>
      <section className="booking-container container">
        <form className="booking-ui booking-form" onSubmit={submit}>
          {error && <div className="booking-error" role="alert">{error}</div>}
          <label>
            Private appointment link
            <input
              type="url"
              required
              placeholder="Paste your full private link"
              value={link}
              onChange={(event) => setLink(event.target.value)}
            />
          </label>
          <p className="booking-note">
            Keep your link private. A booking reference alone won’t open your details.
          </p>
          <button className="button">Open My Booking</button>
        </form>
      </section>
    </>
  );
}
