import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { Task } from './entities/task.entity'

@Injectable()
export class TasksService {
	private tasks: Task[] = [];

	create(createTaskDto: CreateTaskDto) {
		const newTask: Task = {
			id: Math.random().toString(36).substring(2, 9),
			...createTaskDto,
			status: 'PENDING',
		}
		this.tasks.push(newTask);
		return (newTask);
	}

	findAll(): Task[] {
		return (this.tasks)
	}

	findOne(id: string): Task {
		const task = this.tasks.find((task) => task.id === id);
		if (!task)
			throw new NotFoundException(`The task ${id} is not found.`);
		return (task);
	}

	update(id: string, updateTaskDto: UpdateTaskDto): Task {
		const task = this.findOne(id);
		const updated = { ...task, ...updateTaskDto };
		this.tasks = this.tasks.map((t) => t.id === id ? updated : t);
		return (updated);
	}

	remove(id: string): { message: string } {
		this.findOne(id);
		this.tasks = this.tasks.filter((task) => task.id === id);
		return ({ message: `The task ${id} was succesfully deleted.` });
	}
}
