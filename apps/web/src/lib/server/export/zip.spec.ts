import { describe, expect, it } from 'vitest';
import { readZip, writeZip, ZipError } from './zip.ts';

describe('zip', () => {
	it('reads back what it writes, names and bytes included', () => {
		const entries = [
			{ name: 'a.txt', data: Buffer.from('hello') },
			{ name: 'dir/ü.xml', data: Buffer.from('<x/>'.repeat(1000)) },
			{ name: 'empty', data: Buffer.alloc(0) }
		];
		const zip = writeZip(entries);
		expect(readZip(zip)).toEqual(entries);
		// Fixed timestamps: equal input gives equal bytes.
		expect(writeZip(entries).equals(zip)).toBe(true);
	});

	it('rejects anything that is not a zip file', () => {
		expect(() => readZip(Buffer.from('not a zip'))).toThrow(ZipError);
		const zip = writeZip([{ name: 'a', data: Buffer.from('abc') }]);
		expect(() => readZip(zip.subarray(10))).toThrow();
	});
});
