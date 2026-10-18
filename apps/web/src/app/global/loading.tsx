export default function GlobalLoading() {
  return (
    <>
      <div className="page-head">
        <div className="skeleton skeleton-title" />
        <div className="skeleton skeleton-copy" />
      </div>
      <div className="global-list-skeleton" aria-label="Loading global companies" aria-busy="true">
        {Array.from({ length: 6 }, (_, index) => (
          <div className="global-row-skeleton" key={index}>
            <div>
              <div className="skeleton skeleton-name" />
              <div className="skeleton skeleton-description" />
            </div>
            <div className="skeleton skeleton-button" />
          </div>
        ))}
      </div>
    </>
  );
}
