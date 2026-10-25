import React from "react";
import UserAvatar from "./UserAvatar";

function UserList({ localUser, remoteUsers, spatialMetrics }) {
  return (
    <section className="sidebar-panel" aria-label="People in Office">
      <h3>People in Office ({1 + remoteUsers.length})</h3>
      <div className="user-list-items">
        {localUser && <UserAvatar user={localUser} metric={null} />}
        {remoteUsers.map((user) => (
          <UserAvatar
            key={user.id}
            user={user}
            metric={spatialMetrics ? spatialMetrics[user.id] : null}
          />
        ))}
      </div>
    </section>
  );
}

export default UserList;
