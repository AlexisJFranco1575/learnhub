import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// Never expose passwordHash or refreshTokenHash.
const publicUserSelect = {
  id: true,
  email: true,
  fullName: true,
  role: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: publicUserSelect,
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  findAll() {
    return this.prisma.user.findMany({
      select: publicUserSelect,
      orderBy: { createdAt: 'desc' },
    });
  }
}