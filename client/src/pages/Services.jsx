import { PageHeading, VisitCTA } from "../components/Shared";
import ServiceCatalogue from "../catalogue/ServiceCatalogue";
export default function Services() {
  return (
    <>
      <PageHeading
        eyebrow="THE BEAUTY MENU"
        title={
          <>
            Find your kind of <em>beautiful.</em>
          </>
        }
      >
        Explore the salon’s current services, prices, and appointment lengths.
      </PageHeading>
      <div className="notice container">
        The menu is managed by the salon. Online availability is only shown
        when a qualified artist and recurring schedule are configured.
      </div>
      <section className="container service-details">
        <ServiceCatalogue />
      </section>
      <VisitCTA />
    </>
  );
}
