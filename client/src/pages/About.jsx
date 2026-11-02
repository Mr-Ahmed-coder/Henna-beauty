import { PageHeading, VisitCTA } from "../components/Shared";
export default function About() {
  return (
    <>
      <PageHeading title="About Henna & Beauty">Henna and beauty services for Minnesota’s Somali community.</PageHeading>
      <section className="about-copy container">
        <h2>A visit that feels like you</h2>
        <p>Browse the services, choose your artist, and book a time. If you prefer a walk-in, you can join the day’s queue online.</p>
        <p>Official team photos, salon location, and business details are awaiting confirmation. The artwork shown here is an illustration, not a member of our team.</p>
      </section>
      <VisitCTA />
    </>
  );
}
