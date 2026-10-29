const getProximityChanges = (previousUsers, currentUsers) => {
    const previousSet = new Set(previousUsers);
    const currentSet = new Set(currentUsers);

    // Users who entered earshot
    const entered = [...currentSet].filter(
        (userId) => !previousSet.has(userId)
    );

    // Users who left earshot
    const exited = [...previousSet].filter(
        (userId) => !currentSet.has(userId)
    );

    return { entered, exited };
};

module.exports = { getProximityChanges };