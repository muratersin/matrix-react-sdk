/*
Copyright 2020 - 2022 The Matrix.org Foundation C.I.C.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import { Room } from "matrix-js-sdk/src/matrix";

import { NotificationColor } from "./NotificationColor";
import { arrayDiff } from "../../utils/arrays";
import { RoomNotificationState } from "./RoomNotificationState";
import { NotificationState, NotificationStateEvents } from "./NotificationState";

export type FetchRoomFn = (room: Room) => RoomNotificationState;

export class ListNotificationState extends NotificationState {
    private rooms: Room[] = [];
    private states: { [roomId: string]: RoomNotificationState } = {};

    public constructor(
        private byTileCount = false,
        private getRoomFn: FetchRoomFn,
    ) {
        super();
    }

    public get symbol(): string | null {
        return this._color === NotificationColor.Unsent ? "!" : null;
    }

    public setRooms(rooms: Room[]): void {
        // If we're only concerned about the tile count, don't bother setting up listeners.
        if (this.byTileCount) {
            this.rooms = rooms;
            this.calculateTotalState();
            return;
        }

        const oldRooms = this.rooms;
        const diff = arrayDiff(oldRooms, rooms);
        this.rooms = [...rooms];
        for (const oldRoom of diff.removed) {
            const state = this.states[oldRoom.roomId];
            if (!state) continue; // We likely just didn't have a badge (race condition)
            delete this.states[oldRoom.roomId];
            state.off(NotificationStateEvents.Update, this.onRoomNotificationStateUpdate);
        }
        for (const newRoom of diff.added) {
            const state = this.getRoomFn(newRoom);
            state.on(NotificationStateEvents.Update, this.onRoomNotificationStateUpdate);
            this.states[newRoom.roomId] = state;
        }

        this.calculateTotalState();
    }

    public getForRoom(room: Room): RoomNotificationState {
        const state = this.states[room.roomId];
        if (!state) throw new Error("Unknown room for notification state");
        return state;
    }

    public destroy(): void {
        super.destroy();
        for (const state of Object.values(this.states)) {
            state.off(NotificationStateEvents.Update, this.onRoomNotificationStateUpdate);
        }
        this.states = {};
    }

    private onRoomNotificationStateUpdate = (): void => {
        this.calculateTotalState();
    };

    private calculateTotalState(): void {
        const snapshot = this.snapshot();

        if (this.byTileCount) {
            this._color = NotificationColor.Red;
            this._count = this.rooms.length;
        } else {
            this._count = 0;
            this._color = NotificationColor.None;
            for (const state of Object.values(this.states)) {
                this._count += state.count;
                this._color = Math.max(this.color, state.color);
            }
        }

        // finally, publish an update if needed
        this.emitIfUpdated(snapshot);
    }
}
