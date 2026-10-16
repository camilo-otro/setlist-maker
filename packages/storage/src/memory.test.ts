import { describeRepositoryContract } from './contract';
import { createMemoryRepository } from './memory';

describeRepositoryContract('In-memory', createMemoryRepository);
