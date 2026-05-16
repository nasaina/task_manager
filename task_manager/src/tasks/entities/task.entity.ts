export class Task {
	id: string;
	title: string;
	description?: string;
	status: 'PENDING' | 'IN_PROGRESS' | 'DONE'
}
