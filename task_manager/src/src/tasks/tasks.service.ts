import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { PrismaService } from '../prisma/prisma.service';
import { Task } from '@prisma/client';

@Injectable()
export class TasksService {
	constructor(private prisma: PrismaService) { }

	async create(createTaskDto: CreateTaskDto): Promise<Task> {
		const id = Math.random().toString(36).substring(2, 9);
		return this.prisma.task.create({
			data: {
				id,
				...createTaskDto,
			},
		});
	}

	async findAll(): Promise<Task[]> {
		return this.prisma.task.findMany();
	}

	async findOne(id: string): Promise<Task> {
		const task = await this.prisma.task.findUnique({
			where: { id },
		});
		if (!task) {
			throw new NotFoundException(`The task ${id} is not found.`);
		}
		return task;
	}

	async update(id: string, updateTaskDto: UpdateTaskDto): Promise<Task> {
		await this.findOne(id);
		return this.prisma.task.update({
			where: { id },
			data: updateTaskDto,
		});
	}

	async remove(id: string): Promise<{ message: string }> {
		await this.findOne(id);
		await this.prisma.task.delete({
			where: { id },
		});
		return { message: `The task ${id} was successfully deleted.` };
	}
}
