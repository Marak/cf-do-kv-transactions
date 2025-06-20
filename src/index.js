import { DurableObject } from 'cloudflare:workers';

export class TransactionDurableObject {
	constructor(state, env) {
		this.state = state;
		this.env = env;
	}

	async fetch(request) {
		const url = new URL(request.url);
		const path = url.pathname;

		const storage = this.state.storage;

		if (path === '/write/atomic') {
			// Synchronously fire the writes in the same microtask
			this.simulateAtomicFail(storage);
			return new Response('This line should not run');
		}

		if (path === '/write/non-atomic') {
			// Concurrent writes using Promise.all
			await Promise.all([
				storage.put('a', '1'),
				storage.put('b', '2'),
				(() => { throw new Error('Simulated crash') })(), // Simulate throw
			]);
			return new Response('Unreachable');
		}

		if (path === '/write/awaited') {
			// Sequential, awaited writes — not atomic
			await storage.put('a', '1');
			await storage.put('b', '2');
			throw new Error('Simulated crash');
		}

		if (path === '/read') {
			const keys = ['a', 'b'];
			const result = Object.fromEntries(await Promise.all(
				keys.map(async k => [k, await storage.get(k)])
			));
			return new Response(JSON.stringify(result, null, 2), {
				headers: { 'Content-Type': 'application/json' },
			});
		}

		if (path === '/reset') {
			await storage.deleteAll();
			return new Response('Storage reset');
		}

		return new Response('Not found', { status: 404 });
	}

	// this works as expecte, and it rolls back all writes
	simulateAtomicFail(storage) {
		this.storage.transaction(async (tx) => {
			storage.put('a', '1'); // this rolls back
			storage.put('b', Symbol('bad')); // this will crash the write
			storage.put('c', '2'); // this never happens
		});
	}
}
export default {
	fetch: (request, env, ctx) => {
		const id = env.TRANSACTION_DO.idFromName('transaction');
		const obj = env.TRANSACTION_DO.get(id);
		return obj.fetch(request, env, ctx);
	},
};