import plugins from '../plugins';
import db from '../database';
import slugify from '../slugify';
import batch from '../batch';

type Cache = {
    reset(): void;
}

type GroupsConfiguration = {
    cache: Cache;
    destroy(groupNames: string[]): Promise<void>;
    getGroupsData(groupNames: string[]):Promise<GroupData[]>;
    isPrivilegeGroup(group: string): boolean;
}

type GroupData = {
    name: string;
}


export = function (Groups: GroupsConfiguration): void {
    Groups.destroy = async function (groupNames: string[]) {
        if (!Array.isArray(groupNames)) {
            groupNames = [groupNames];
        }

        let groupsData = await Groups.getGroupsData(groupNames);
        groupsData = groupsData.filter(Boolean);
        if (!groupsData.length) {
            return;
        }
        const keys = [];
        groupNames.forEach((groupName) => {
            keys.push(
                `group:${groupName}`,
                `group:${groupName}:members`,
                `group:${groupName}:pending`,
                `group:${groupName}:invited`,
                `group:${groupName}:owners`,
                `group:${groupName}:member:pids`
            );
        });

        const sets = groupNames.map(groupName => `${groupName.toLowerCase()}:${groupName}`);
        const fields = groupNames.map(groupName => slugify(groupName) as string);

        async function removeGroupsFromPrivilegeGroups(groupNames: string[]) {
            await batch.processSortedSet('groups:createtime', async (otherGroups: string[]) => {
                const privilegeGroups = otherGroups.filter(group => Groups.isPrivilegeGroup(group));
                const keys = privilegeGroups.map(group => `group:${group}:members`);
                // The next line calls a function in a module that has not been updated to TS yet
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-unsafe-call
                await db.sortedSetRemove(keys, groupNames);
            }, {
                batch: 500,
            });
        }
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        await Promise.all([
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            db.deleteAll(keys),
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            db.sortedSetRemove(['groups:createtime',
                'groups:visible:createtime',
                'groups:visible:memberCount',
            ], groupNames),
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            db.sortedSetRemove('groups:visible:name', sets),
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            db.deleteObjectFields('groupslug:groupname', fields),
            removeGroupsFromPrivilegeGroups(groupNames),
        ]);
        Groups.cache.reset();
        await plugins.hooks.fire('action:groups.destroy', { groups: groupsData });
    };
};
